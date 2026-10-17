from decimal import Decimal

from rest_framework import serializers

from suppliers.models import Supplier

from .models import Category, Item, LowStockAlert, MaterialConsumption, StockTransaction, Warehouse


class CategorySerializer(serializers.ModelSerializer):
    item_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Category
        fields = ["id", "name", "description", "item_count", "created_at", "updated_at"]
        read_only_fields = ["created_at", "updated_at"]


class WarehouseSerializer(serializers.ModelSerializer):
    item_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Warehouse
        fields = ["id", "name", "code", "location", "is_active", "item_count", "created_at", "updated_at"]
        read_only_fields = ["created_at", "updated_at"]


class ItemSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    preferred_supplier_name = serializers.CharField(source="preferred_supplier.name", read_only=True)
    warehouse_name = serializers.CharField(source="warehouse.name", read_only=True)
    unit_display = serializers.CharField(source="get_unit_display", read_only=True)
    is_low_stock = serializers.BooleanField(read_only=True)
    is_out_of_stock = serializers.BooleanField(read_only=True)
    stock_value = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)
    opening_quantity = serializers.DecimalField(
        max_digits=14, decimal_places=3, write_only=True, required=False, min_value=Decimal("0"),
        help_text="Optional opening stock when creating an item (recorded as an adjustment transaction).",
    )

    class Meta:
        model = Item
        fields = [
            "id", "sku", "name", "description", "category", "category_name",
            "preferred_supplier", "preferred_supplier_name", "warehouse", "warehouse_name",
            "unit", "unit_display", "unit_cost", "quantity_on_hand", "reorder_level", "reorder_quantity",
            "is_active", "is_low_stock", "is_out_of_stock", "stock_value", "opening_quantity",
            "created_at", "updated_at",
        ]
        read_only_fields = ["quantity_on_hand", "created_at", "updated_at"]

    def validate_sku(self, value):
        return value.strip().upper()

    def create(self, validated_data):
        from .services import apply_stock_movement

        opening = validated_data.pop("opening_quantity", None)
        item = super().create(validated_data)
        if opening and opening > 0:
            request = self.context.get("request")
            apply_stock_movement(
                item_id=item.pk,
                transaction_type=StockTransaction.Type.ADJUSTMENT,
                quantity=opening,
                user=getattr(request, "user", None),
                reference="opening-stock",
                notes="Opening stock on item creation",
                unit_cost=item.unit_cost,
            )
            item.refresh_from_db()
        else:
            from .services import sync_low_stock_alert

            sync_low_stock_alert(item)
        return item

    def update(self, instance, validated_data):
        from .services import sync_low_stock_alert

        validated_data.pop("opening_quantity", None)
        instance = super().update(instance, validated_data)
        sync_low_stock_alert(instance)  # reorder level may have changed
        return instance


class StockTransactionSerializer(serializers.ModelSerializer):
    item_sku = serializers.CharField(source="item.sku", read_only=True)
    item_name = serializers.CharField(source="item.name", read_only=True)
    item_unit = serializers.CharField(source="item.unit", read_only=True)
    transaction_type_display = serializers.CharField(source="get_transaction_type_display", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True, default=None)
    po_number = serializers.CharField(source="purchase_order.po_number", read_only=True, default=None)

    class Meta:
        model = StockTransaction
        fields = [
            "id", "item", "item_sku", "item_name", "item_unit", "transaction_type", "transaction_type_display",
            "quantity", "balance_after", "unit_cost", "reference", "purchase_order", "po_number", "notes",
            "created_by", "created_by_username", "created_at",
        ]
        read_only_fields = ["balance_after", "created_by", "purchase_order", "created_at"]

    def validate(self, attrs):
        ttype = attrs.get("transaction_type")
        qty = attrs.get("quantity")
        if ttype == StockTransaction.Type.PURCHASE:
            raise serializers.ValidationError(
                {"transaction_type": "Purchase receipts are recorded by receiving a purchase order."}
            )
        if ttype == StockTransaction.Type.CONSUMPTION:
            raise serializers.ValidationError(
                {"transaction_type": "Use the /api/consumptions/ endpoint to record material consumption."}
            )
        if qty is None or qty == 0:
            raise serializers.ValidationError({"quantity": "Quantity cannot be zero."})
        if ttype != StockTransaction.Type.ADJUSTMENT and qty < 0:
            raise serializers.ValidationError(
                {"quantity": "Enter a positive quantity; the direction is determined by the transaction type."}
            )
        return attrs

    def create(self, validated_data):
        from .services import apply_stock_movement

        request = self.context.get("request")
        return apply_stock_movement(
            item_id=validated_data["item"].pk,
            transaction_type=validated_data["transaction_type"],
            quantity=validated_data["quantity"],
            user=getattr(request, "user", None),
            reference=validated_data.get("reference", ""),
            notes=validated_data.get("notes", ""),
            unit_cost=validated_data.get("unit_cost"),
        )


class MaterialConsumptionSerializer(serializers.ModelSerializer):
    item_sku = serializers.CharField(source="item.sku", read_only=True)
    item_name = serializers.CharField(source="item.name", read_only=True)
    item_unit = serializers.CharField(source="item.unit", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True, default=None)
    cost = serializers.SerializerMethodField()

    class Meta:
        model = MaterialConsumption
        fields = [
            "id", "item", "item_sku", "item_name", "item_unit", "quantity", "consumed_on", "department",
            "work_order", "purpose", "transaction", "cost", "created_by", "created_by_username", "created_at",
        ]
        read_only_fields = ["transaction", "created_by", "created_at"]

    def get_cost(self, obj):
        unit_cost = obj.transaction.unit_cost if obj.transaction and obj.transaction.unit_cost is not None else obj.item.unit_cost
        return str((obj.quantity or 0) * (unit_cost or 0))

    def create(self, validated_data):
        from .services import record_consumption

        request = self.context.get("request")
        return record_consumption(
            item_id=validated_data["item"].pk,
            quantity=validated_data["quantity"],
            consumed_on=validated_data["consumed_on"],
            user=getattr(request, "user", None),
            department=validated_data.get("department", ""),
            work_order=validated_data.get("work_order", ""),
            purpose=validated_data.get("purpose", ""),
        )

    def update(self, instance, validated_data):
        # Quantity/item changes would require reversing ledger entries; keep consumption records immutable
        # except for descriptive fields.
        for field in ("department", "work_order", "purpose", "consumed_on"):
            if field in validated_data:
                setattr(instance, field, validated_data[field])
        instance.save()
        return instance


class LowStockAlertSerializer(serializers.ModelSerializer):
    item_sku = serializers.CharField(source="item.sku", read_only=True)
    item_name = serializers.CharField(source="item.name", read_only=True)
    item_unit = serializers.CharField(source="item.unit", read_only=True)
    current_quantity = serializers.DecimalField(source="item.quantity_on_hand", max_digits=14, decimal_places=3, read_only=True)
    reorder_quantity = serializers.DecimalField(source="item.reorder_quantity", max_digits=14, decimal_places=3, read_only=True)
    preferred_supplier = serializers.PrimaryKeyRelatedField(source="item.preferred_supplier", read_only=True)
    preferred_supplier_name = serializers.CharField(source="item.preferred_supplier.name", read_only=True, default=None)
    acknowledged_by_username = serializers.CharField(source="acknowledged_by.username", read_only=True, default=None)

    class Meta:
        model = LowStockAlert
        fields = [
            "id", "item", "item_sku", "item_name", "item_unit", "quantity_at_alert", "current_quantity",
            "reorder_level", "reorder_quantity", "preferred_supplier", "preferred_supplier_name", "status",
            "message", "acknowledged_by", "acknowledged_by_username", "acknowledged_at", "resolved_at", "created_at",
        ]
        read_only_fields = fields
