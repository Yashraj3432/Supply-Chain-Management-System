"""Purchase order workflow: status transitions and goods receipt."""
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from inventory.models import StockTransaction
from inventory.services import apply_stock_movement

from .models import PurchaseOrder, PurchaseOrderLine


@transaction.atomic
def change_status(po: PurchaseOrder, new_status: str, user=None) -> PurchaseOrder:
    po = PurchaseOrder.objects.select_for_update().get(pk=po.pk)
    if not po.can_transition_to(new_status):
        raise ValidationError(
            {"status": f"Cannot change status from '{po.get_status_display()}' to '{new_status}'."}
        )
    if new_status == PurchaseOrder.Status.SUBMITTED and not po.lines.exists():
        raise ValidationError({"status": "Add at least one line before submitting the purchase order."})
    po.status = new_status
    fields = ["status", "updated_at"]
    if new_status == PurchaseOrder.Status.APPROVED:
        po.approved_by = user if getattr(user, "is_authenticated", False) else None
        po.approved_at = timezone.now()
        fields += ["approved_by", "approved_at"]
    po.save(update_fields=fields)
    return po


@transaction.atomic
def receive_goods(po: PurchaseOrder, receipts: list[dict], user=None, notes: str = "") -> PurchaseOrder:
    """Receive goods against PO lines.

    `receipts` is a list of {"line": <line id>, "quantity": <Decimal>}. Every receipt
    creates a purchase StockTransaction; the whole call is all-or-nothing.
    """
    po = PurchaseOrder.objects.select_for_update().get(pk=po.pk)
    if po.status not in PurchaseOrder.RECEIVABLE_STATUSES:
        raise ValidationError({"status": f"Goods can only be received on approved orders (current: {po.get_status_display()})."})
    if not receipts:
        raise ValidationError({"receipts": "Provide at least one line to receive."})

    lines = {line.pk: line for line in PurchaseOrderLine.objects.select_for_update().filter(purchase_order=po)}
    for receipt in receipts:
        line = lines.get(int(receipt["line"]))
        if line is None:
            raise ValidationError({"receipts": f"Line {receipt['line']} does not belong to {po.po_number}."})
        qty = Decimal(str(receipt["quantity"]))
        if qty <= 0:
            continue
        if qty > line.quantity_pending:
            raise ValidationError(
                {"receipts": f"Cannot receive {qty} of {line.item.sku}; only {line.quantity_pending} pending."}
            )
        apply_stock_movement(
            item_id=line.item_id,
            transaction_type=StockTransaction.Type.PURCHASE,
            quantity=qty,
            user=user,
            reference=po.po_number,
            notes=notes or f"Goods receipt for {po.po_number}",
            unit_cost=line.unit_price,
            purchase_order=po,
            update_unit_cost=True,  # last purchase price becomes the item's unit cost
        )
        line.quantity_received = (line.quantity_received or 0) + qty
        line.save(update_fields=["quantity_received"])

    all_received = all(line.quantity_pending <= 0 for line in lines.values())
    any_received = any((line.quantity_received or 0) > 0 for line in lines.values())
    if all_received:
        po.status = PurchaseOrder.Status.RECEIVED
        po.received_date = timezone.localdate()
    elif any_received:
        po.status = PurchaseOrder.Status.PARTIALLY_RECEIVED
    po.save(update_fields=["status", "received_date", "updated_at"])
    return po
