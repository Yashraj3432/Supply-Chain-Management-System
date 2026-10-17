import django_filters
from django.db.models import Count, F
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Category, Item, LowStockAlert, MaterialConsumption, StockTransaction, Warehouse
from .serializers import (
    CategorySerializer,
    ItemSerializer,
    LowStockAlertSerializer,
    MaterialConsumptionSerializer,
    StockTransactionSerializer,
    WarehouseSerializer,
)
from .services import sync_low_stock_alert


class CategoryViewSet(viewsets.ModelViewSet):
    serializer_class = CategorySerializer
    search_fields = ["name", "description"]
    ordering_fields = ["name", "created_at"]
    pagination_class = None

    def get_queryset(self):
        return Category.objects.annotate(item_count=Count("items"))


class WarehouseViewSet(viewsets.ModelViewSet):
    serializer_class = WarehouseSerializer
    filterset_fields = ["is_active"]
    search_fields = ["name", "code", "location"]
    pagination_class = None

    def get_queryset(self):
        return Warehouse.objects.annotate(item_count=Count("items"))


class ItemFilter(django_filters.FilterSet):
    low_stock = django_filters.BooleanFilter(method="filter_low_stock")
    out_of_stock = django_filters.BooleanFilter(method="filter_out_of_stock")
    min_qty = django_filters.NumberFilter(field_name="quantity_on_hand", lookup_expr="gte")
    max_qty = django_filters.NumberFilter(field_name="quantity_on_hand", lookup_expr="lte")

    class Meta:
        model = Item
        fields = ["category", "preferred_supplier", "warehouse", "unit", "is_active"]

    def filter_low_stock(self, queryset, name, value):
        if value is True:
            return queryset.filter(quantity_on_hand__lte=F("reorder_level"))
        if value is False:
            return queryset.filter(quantity_on_hand__gt=F("reorder_level"))
        return queryset

    def filter_out_of_stock(self, queryset, name, value):
        if value is True:
            return queryset.filter(quantity_on_hand__lte=0)
        if value is False:
            return queryset.filter(quantity_on_hand__gt=0)
        return queryset


class ItemViewSet(viewsets.ModelViewSet):
    serializer_class = ItemSerializer
    filterset_class = ItemFilter
    search_fields = ["sku", "name", "description", "category__name", "preferred_supplier__name"]
    ordering_fields = ["sku", "name", "quantity_on_hand", "unit_cost", "reorder_level", "updated_at", "created_at"]
    ordering = ["name"]

    def get_queryset(self):
        return Item.objects.select_related("category", "preferred_supplier", "warehouse")

    @action(detail=True, methods=["get"])
    def transactions(self, request, pk=None):
        item = self.get_object()
        qs = item.transactions.select_related("item", "created_by", "purchase_order")
        page = self.paginate_queryset(qs)
        serializer = StockTransactionSerializer(page if page is not None else qs, many=True)
        return self.get_paginated_response(serializer.data) if page is not None else Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="low-stock")
    def low_stock(self, request):
        qs = self.filter_queryset(self.get_queryset().filter(quantity_on_hand__lte=F("reorder_level"), is_active=True))
        page = self.paginate_queryset(qs)
        serializer = self.get_serializer(page if page is not None else qs, many=True)
        return self.get_paginated_response(serializer.data) if page is not None else Response(serializer.data)


class StockTransactionViewSet(mixins.CreateModelMixin, mixins.RetrieveModelMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    """Ledger entries are append-only; no update/delete."""

    serializer_class = StockTransactionSerializer
    filterset_fields = {
        "item": ["exact"],
        "transaction_type": ["exact", "in"],
        "purchase_order": ["exact"],
        "created_at": ["gte", "lte"],
    }
    search_fields = ["item__sku", "item__name", "reference", "notes"]
    ordering_fields = ["created_at", "quantity", "balance_after"]
    ordering = ["-created_at", "-id"]

    def get_queryset(self):
        return StockTransaction.objects.select_related("item", "created_by", "purchase_order")


class MaterialConsumptionViewSet(viewsets.ModelViewSet):
    serializer_class = MaterialConsumptionSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]
    filterset_fields = {
        "item": ["exact"],
        "department": ["exact", "icontains"],
        "work_order": ["exact", "icontains"],
        "consumed_on": ["exact", "gte", "lte"],
    }
    search_fields = ["item__sku", "item__name", "department", "work_order", "purpose"]
    ordering_fields = ["consumed_on", "quantity", "created_at"]
    ordering = ["-consumed_on", "-id"]

    def get_queryset(self):
        return MaterialConsumption.objects.select_related("item", "created_by", "transaction")


class LowStockAlertViewSet(mixins.RetrieveModelMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = LowStockAlertSerializer
    filterset_fields = ["status", "item"]
    search_fields = ["item__sku", "item__name", "message"]
    ordering_fields = ["created_at", "status"]
    ordering = ["-created_at"]

    def get_queryset(self):
        return LowStockAlert.objects.select_related("item", "item__preferred_supplier", "acknowledged_by")

    @action(detail=True, methods=["post"])
    def acknowledge(self, request, pk=None):
        alert = self.get_object()
        if alert.status == LowStockAlert.Status.RESOLVED:
            return Response({"detail": "Alert is already resolved."}, status=status.HTTP_400_BAD_REQUEST)
        alert.status = LowStockAlert.Status.ACKNOWLEDGED
        alert.acknowledged_by = request.user
        alert.acknowledged_at = timezone.now()
        alert.save(update_fields=["status", "acknowledged_by", "acknowledged_at", "updated_at"])
        return Response(self.get_serializer(alert).data)

    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        alert = self.get_object()
        alert.status = LowStockAlert.Status.RESOLVED
        alert.resolved_at = timezone.now()
        alert.save(update_fields=["status", "resolved_at", "updated_at"])
        return Response(self.get_serializer(alert).data)

    @action(detail=False, methods=["post"])
    def rescan(self, request):
        """Re-evaluate every active item and open/resolve alerts as needed."""
        created = 0
        before = LowStockAlert.objects.filter(status=LowStockAlert.Status.OPEN).count()
        for item in Item.objects.filter(is_active=True):
            sync_low_stock_alert(item)
        after = LowStockAlert.objects.filter(status=LowStockAlert.Status.OPEN).count()
        created = max(after - before, 0)
        return Response({"detail": "Rescan complete.", "open_alerts": after, "newly_opened": created})
