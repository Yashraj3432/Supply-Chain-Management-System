from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Prefetch
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .models import PurchaseOrder, PurchaseOrderLine
from .serializers import (
    PurchaseOrderListSerializer,
    PurchaseOrderSerializer,
    ReceiveGoodsSerializer,
    StatusChangeSerializer,
)
from .services import change_status, receive_goods


def _to_drf(exc: DjangoValidationError) -> ValidationError:
    return ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages)


class PurchaseOrderViewSet(viewsets.ModelViewSet):
    filterset_fields = {
        "status": ["exact", "in"],
        "supplier": ["exact"],
        "order_date": ["gte", "lte"],
        "expected_date": ["gte", "lte"],
    }
    search_fields = ["po_number", "supplier__name", "notes", "lines__item__sku", "lines__item__name"]
    ordering_fields = ["order_date", "expected_date", "po_number", "created_at"]
    ordering = ["-order_date", "-id"]

    def get_queryset(self):
        lines = PurchaseOrderLine.objects.select_related("item")
        return (
            PurchaseOrder.objects.select_related("supplier", "created_by", "approved_by")
            .prefetch_related(Prefetch("lines", queryset=lines))
            .distinct()
        )

    def get_serializer_class(self):
        return PurchaseOrderListSerializer if self.action == "list" else PurchaseOrderSerializer

    def destroy(self, request, *args, **kwargs):
        po = self.get_object()
        if po.status != PurchaseOrder.Status.DRAFT:
            return Response(
                {"detail": "Only draft purchase orders can be deleted. Cancel it instead."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"], url_path="status")
    def set_status(self, request, pk=None):
        serializer = StatusChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            po = change_status(self.get_object(), serializer.validated_data["status"], user=request.user)
        except DjangoValidationError as exc:
            raise _to_drf(exc)
        return Response(PurchaseOrderSerializer(self.get_queryset().get(pk=po.pk)).data)

    @action(detail=True, methods=["post"])
    def receive(self, request, pk=None):
        serializer = ReceiveGoodsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            po = receive_goods(
                self.get_object(),
                serializer.validated_data["receipts"],
                user=request.user,
                notes=serializer.validated_data.get("notes", ""),
            )
        except DjangoValidationError as exc:
            raise _to_drf(exc)
        return Response(PurchaseOrderSerializer(self.get_queryset().get(pk=po.pk)).data)
