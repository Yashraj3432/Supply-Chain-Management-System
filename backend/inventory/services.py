"""
Stock movement service.

All stock changes go through `apply_stock_movement`, which:
  * locks the Item row (SELECT ... FOR UPDATE) inside a DB transaction,
  * validates that stock never goes negative,
  * writes an immutable StockTransaction ledger entry,
  * updates Item.quantity_on_hand,
  * opens / resolves LowStockAlerts automatically.
"""
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from .models import Item, LowStockAlert, StockTransaction


class InsufficientStockError(ValidationError):
    pass


def _signed_quantity(transaction_type: str, quantity: Decimal) -> Decimal:
    """Return the signed delta for a movement.

    For adjustment the caller passes a signed quantity directly.
    For inbound types quantity is made positive, for outbound negative.
    """
    quantity = Decimal(quantity)
    if transaction_type == StockTransaction.Type.ADJUSTMENT:
        return quantity
    if quantity <= 0:
        raise ValidationError({"quantity": "Quantity must be greater than zero."})
    if transaction_type in StockTransaction.INBOUND_TYPES:
        return quantity
    if transaction_type in StockTransaction.OUTBOUND_TYPES:
        return -quantity
    raise ValidationError({"transaction_type": f"Unknown transaction type '{transaction_type}'."})


def sync_low_stock_alert(item: Item) -> LowStockAlert | None:
    """Open an alert if the item is low and none is open; resolve open alerts when stock recovers."""
    open_alerts = item.alerts.filter(status__in=[LowStockAlert.Status.OPEN, LowStockAlert.Status.ACKNOWLEDGED])
    if item.is_low_stock:
        if open_alerts.exists():
            return open_alerts.first()
        state = "out of stock" if item.is_out_of_stock else "below reorder level"
        return LowStockAlert.objects.create(
            item=item,
            quantity_at_alert=item.quantity_on_hand,
            reorder_level=item.reorder_level,
            message=f"{item.sku} ({item.name}) is {state}: {item.quantity_on_hand} {item.unit} "
                    f"on hand, reorder level {item.reorder_level}.",
        )
    if open_alerts.exists():
        open_alerts.update(status=LowStockAlert.Status.RESOLVED, resolved_at=timezone.now())
    return None


@transaction.atomic
def apply_stock_movement(
    *,
    item_id: int,
    transaction_type: str,
    quantity,
    user=None,
    reference: str = "",
    notes: str = "",
    unit_cost=None,
    purchase_order=None,
    update_unit_cost: bool = False,
) -> StockTransaction:
    delta = _signed_quantity(transaction_type, quantity)

    # Row lock so concurrent movements on the same item serialize correctly.
    item = Item.objects.select_for_update().get(pk=item_id)
    new_balance = (item.quantity_on_hand or Decimal("0")) + delta
    if new_balance < 0:
        raise InsufficientStockError(
            {"quantity": f"Insufficient stock for {item.sku}: {item.quantity_on_hand} {item.unit} available, "
                         f"{abs(delta)} requested."}
        )

    item.quantity_on_hand = new_balance
    update_fields = ["quantity_on_hand", "updated_at"]
    if update_unit_cost and unit_cost is not None and Decimal(unit_cost) > 0:
        item.unit_cost = Decimal(unit_cost)
        update_fields.append("unit_cost")
    item.save(update_fields=update_fields)

    txn = StockTransaction.objects.create(
        item=item,
        transaction_type=transaction_type,
        quantity=delta,
        balance_after=new_balance,
        unit_cost=unit_cost if unit_cost is not None else item.unit_cost,
        reference=reference or "",
        notes=notes or "",
        purchase_order=purchase_order,
        created_by=user if getattr(user, "is_authenticated", False) else None,
    )

    sync_low_stock_alert(item)
    return txn


@transaction.atomic
def record_consumption(*, item_id: int, quantity, consumed_on, user=None, department="", work_order="", purpose=""):
    from .models import MaterialConsumption

    txn = apply_stock_movement(
        item_id=item_id,
        transaction_type=StockTransaction.Type.CONSUMPTION,
        quantity=quantity,
        user=user,
        reference=work_order or department or "consumption",
        notes=purpose,
    )
    return MaterialConsumption.objects.create(
        item_id=item_id,
        quantity=quantity,
        consumed_on=consumed_on,
        department=department or "",
        work_order=work_order or "",
        purpose=purpose or "",
        transaction=txn,
        created_by=user if getattr(user, "is_authenticated", False) else None,
    )
