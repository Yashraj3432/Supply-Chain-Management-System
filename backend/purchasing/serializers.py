from django.db import transaction
from rest_framework import serializers

from .models import PurchaseOrder, PurchaseOrderLine


class PurchaseOrderLineSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)
    item_sku = serializers.CharField(source="item.sku", read_only=True)
    item_name = serializers.CharField(source="item.name", read_only=True)
    item_unit = serializers.CharField(source="item.unit", read_only=True)
    line_total = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)
    quantity_pending = serializers.DecimalField(max_digits=14, decimal_places=3, read_only=True)

    class Meta:
        model = PurchaseOrderLine
        fields = [
            "id", "item", "item_sku", "item_name", "item_unit", "quantity_ordered", "quantity_received",
            "quantity_pending", "unit_price", "line_total",
        ]
        read_only_fields = ["quantity_received"]


class PurchaseOrderListSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    total = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)
    line_count = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrder
        fields = [
            "id", "po_number", "supplier", "supplier_name", "status", "status_display", "order_date",
            "expected_date", "received_date", "total", "line_count", "created_at",
        ]

    def get_line_count(self, obj):
        return len(obj.lines.all())


class PurchaseOrderSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    lines = PurchaseOrderLineSerializer(many=True)
    subtotal = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)
    tax_amount = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)
    total = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True, default=None)
    approved_by_username = serializers.CharField(source="approved_by.username", read_only=True, default=None)

    class Meta:
        model = PurchaseOrder
        fields = [
            "id", "po_number", "supplier", "supplier_name", "status", "status_display", "order_date",
            "expected_date", "received_date", "tax_percent", "shipping_cost", "notes", "lines",
            "subtotal", "tax_amount", "total", "created_by", "created_by_username",
            "approved_by", "approved_by_username", "approved_at", "created_at", "updated_at",
        ]
        read_only_fields = [
            "po_number", "status", "received_date", "created_by", "approved_by", "approved_at",
            "created_at", "updated_at",
        ]

    def validate_lines(self, lines):
        if not lines:
            raise serializers.ValidationError("A purchase order needs at least one line.")
        item_ids = [line["item"].pk for line in lines]
        if len(item_ids) != len(set(item_ids)):
            raise serializers.ValidationError("Each item can appear only once per purchase order.")
        return lines

    def validate(self, attrs):
        if self.instance and self.instance.status not in PurchaseOrder.EDITABLE_STATUSES:
            raise serializers.ValidationError(
                {"status": f"Only draft purchase orders can be edited (current: {self.instance.get_status_display()})."}
            )
        supplier = attrs.get("supplier") or (self.instance.supplier if self.instance else None)
        if supplier and not supplier.is_active:
            raise serializers.ValidationError({"supplier": "This supplier is inactive."})
        order_date = attrs.get("order_date") or (self.instance.order_date if self.instance else None)
        expected = attrs.get("expected_date")
        if expected and order_date and expected < order_date:
            raise serializers.ValidationError({"expected_date": "Expected date cannot be before the order date."})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        lines = validated_data.pop("lines")
        request = self.context.get("request")
        user = getattr(request, "user", None)
        po = PurchaseOrder.objects.create(created_by=user if getattr(user, "is_authenticated", False) else None, **validated_data)
        for line in lines:
            line.pop("id", None)
            PurchaseOrderLine.objects.create(purchase_order=po, **line)
        return po

    @transaction.atomic
    def update(self, instance, validated_data):
        lines = validated_data.pop("lines", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if lines is not None:
            # Replace lines wholesale (only allowed in draft, so nothing has been received).
            instance.lines.all().delete()
            for line in lines:
                line.pop("id", None)
                PurchaseOrderLine.objects.create(purchase_order=instance, **line)
        return instance


class StatusChangeSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=PurchaseOrder.Status.choices)


class ReceiptLineSerializer(serializers.Serializer):
    line = serializers.IntegerField()
    quantity = serializers.DecimalField(max_digits=14, decimal_places=3, min_value=0)


class ReceiveGoodsSerializer(serializers.Serializer):
    receipts = ReceiptLineSerializer(many=True)
    notes = serializers.CharField(required=False, allow_blank=True)
