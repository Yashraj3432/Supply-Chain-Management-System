from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

from inventory.models import Item
from suppliers.models import Supplier, TimeStampedModel


class PurchaseOrder(TimeStampedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SUBMITTED = "submitted", "Submitted"
        APPROVED = "approved", "Approved"
        PARTIALLY_RECEIVED = "partially_received", "Partially received"
        RECEIVED = "received", "Received"
        CANCELLED = "cancelled", "Cancelled"

    OPEN_STATUSES = [Status.DRAFT, Status.SUBMITTED, Status.APPROVED, Status.PARTIALLY_RECEIVED]
    EDITABLE_STATUSES = [Status.DRAFT]
    RECEIVABLE_STATUSES = [Status.APPROVED, Status.PARTIALLY_RECEIVED]

    # Allowed status transitions (receiving is handled separately).
    TRANSITIONS = {
        Status.DRAFT: {Status.SUBMITTED, Status.CANCELLED},
        Status.SUBMITTED: {Status.APPROVED, Status.DRAFT, Status.CANCELLED},
        Status.APPROVED: {Status.CANCELLED},
        Status.PARTIALLY_RECEIVED: set(),
        Status.RECEIVED: set(),
        Status.CANCELLED: set(),
    }

    po_number = models.CharField(max_length=30, unique=True, editable=False)
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="purchase_orders")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    order_date = models.DateField(default=timezone.localdate)
    expected_date = models.DateField(null=True, blank=True)
    received_date = models.DateField(null=True, blank=True)
    tax_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    shipping_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="purchase_orders"
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="approved_purchase_orders"
    )
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-order_date", "-id"]
        indexes = [models.Index(fields=["status"]), models.Index(fields=["order_date"])]

    def __str__(self):
        return f"{self.po_number} ({self.supplier.name})"

    def save(self, *args, **kwargs):
        if not self.po_number:
            self.po_number = self._next_po_number(self.order_date)
        super().save(*args, **kwargs)

    @classmethod
    def _next_po_number(cls, order_date=None) -> str:
        prefix = f"PO-{(order_date or timezone.localdate()):%Y%m}-"
        last = cls.objects.filter(po_number__startswith=prefix).order_by("-po_number").values_list("po_number", flat=True).first()
        seq = int(last.rsplit("-", 1)[-1]) + 1 if last else 1
        return f"{prefix}{seq:04d}"

    @property
    def subtotal(self) -> Decimal:
        return sum((line.line_total for line in self.lines.all()), Decimal("0"))

    @property
    def tax_amount(self) -> Decimal:
        return (self.subtotal * self.tax_percent / Decimal("100")).quantize(Decimal("0.01"))

    @property
    def total(self) -> Decimal:
        return self.subtotal + self.tax_amount + (self.shipping_cost or 0)

    def can_transition_to(self, new_status: str) -> bool:
        return new_status in self.TRANSITIONS.get(self.status, set())


class PurchaseOrderLine(models.Model):
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name="lines")
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name="po_lines")
    quantity_ordered = models.DecimalField(max_digits=14, decimal_places=3, validators=[MinValueValidator(Decimal("0.001"))])
    quantity_received = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(fields=["purchase_order", "item"], name="unique_item_per_po"),
        ]

    def __str__(self):
        return f"{self.purchase_order.po_number}: {self.quantity_ordered} x {self.item.sku}"

    @property
    def line_total(self) -> Decimal:
        return (self.quantity_ordered or 0) * (self.unit_price or 0)

    @property
    def quantity_pending(self) -> Decimal:
        return max((self.quantity_ordered or 0) - (self.quantity_received or 0), Decimal("0"))
