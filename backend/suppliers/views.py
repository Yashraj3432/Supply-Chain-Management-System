from django.db.models import Count, Q
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from purchasing.models import PurchaseOrder
from purchasing.serializers import PurchaseOrderListSerializer

from .models import Supplier
from .serializers import SupplierSerializer


class SupplierViewSet(viewsets.ModelViewSet):
    serializer_class = SupplierSerializer
    filterset_fields = ["is_active", "country", "city"]
    search_fields = ["name", "code", "contact_person", "email", "phone", "city"]
    ordering_fields = ["name", "code", "rating", "lead_time_days", "created_at"]
    ordering = ["name"]

    def get_queryset(self):
        return Supplier.objects.annotate(
            item_count=Count("items", distinct=True),
            open_po_count=Count(
                "purchase_orders",
                filter=Q(purchase_orders__status__in=PurchaseOrder.OPEN_STATUSES),
                distinct=True,
            ),
        )

    @action(detail=True, methods=["get"])
    def purchase_orders(self, request, pk=None):
        supplier = self.get_object()
        qs = supplier.purchase_orders.select_related("supplier").order_by("-order_date", "-id")
        page = self.paginate_queryset(qs)
        serializer = PurchaseOrderListSerializer(page or qs, many=True)
        return self.get_paginated_response(serializer.data) if page is not None else Response(serializer.data)
