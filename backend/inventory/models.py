from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

from suppliers.models import Supplier, TimeStampedModel


class Category(TimeStampedModel):
    name = models.CharField(max_length=120, unique=True)
    description = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name


class Warehouse(TimeStampedModel):
    name = models.CharField(max_length=120, unique=True)
    code = models.CharField(max_length=20, unique=True)
    location = models.CharField(max_length=200, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.code} - {self.name}"


class Item(TimeStampedModel):
    """A stock-keeping unit (raw material, component or finished good)."""

    class Unit(models.TextChoices):
        PIECE = "pcs", "Pieces"
        KILOGRAM = "kg", "Kilograms"
        GRAM = "g", "Grams"
        LITRE = "l", "Litres"
        METRE = "m", "Metres"
        BOX = "box", "Boxes"
        SET = "set", "Sets"

    sku = models.CharField("SKU", max_length=50, unique=True)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL, related_name="items")
    preferred_supplier = models.ForeignKey(
        Supplier, null=True, blank=True, on_delete=models.SET_NULL, related_name="items"
    )
    warehouse = models.ForeignKey(Warehouse, null=True, blank=True, on_delete=models.SET_NULL, related_name="items")
    unit = models.CharField(max_length=10, choices=Unit.choices, default=Unit.PIECE)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    quantity_on_hand = models.DecimalField(
        max_digits=14, decimal_places=3, default=0, validators=[MinValueValidator(0)],
        help_text="Maintained automatically by stock transactions. Do not edit directly.",
    )
    reorder_level = models.DecimalField(
        max_digits=14, decimal_places=3, default=settings.LOW_STOCK_DEFAULT_THRESHOLD,
        validators=[MinValueValidator(0)], help_text="Alert when quantity falls to or below this level",
    )
    reorder_quantity = models.DecimalField(
        max_digits=14, decimal_places=3, default=0, validators=[MinValueValidator(0)],
        help_text="Suggested quantity to order when low",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        indexes = [
            models.Index(fields=["sku"]),
            models.Index(fields=["name"]),
        ]

    def __str__(self):
        return f"{self.sku} - {self.name}"

    @property
    def is_low_stock(self) -> bool:
        return self.quantity_on_hand <= self.reorder_level

    @property
    def is_out_of_stock(self) -> bool:
        return self.quantity_on_hand <= 0

    @property
    def stock_value(self) -> Decimal:
        return (self.quantity_on_hand or 0) * (self.unit_cost or 0)


class StockTransaction(TimeStampedModel):
    """Immutable ledger of every stock movement. Item.quantity_on_hand is derived from these."""

    class Type(models.TextChoices):
        PURCHASE = "purchase", "Purchase receipt"
        CONSUMPTION = "consumption", "Material consumption"
        ADJUSTMENT = "adjustment", "Manual adjustment"
        RETURN = "return", "Return to supplier"
        TRANSFER_IN = "transfer_in", "Transfer in"
        TRANSFER_OUT = "transfer_out", "Transfer out"

    # Positive quantity types add stock; the rest remove it.
    INBOUND_TYPES = {Type.PURCHASE, Type.TRANSFER_IN}
    OUTBOUND_TYPES = {Type.CONSUMPTION, Type.RETURN, Type.TRANSFER_OUT}

    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name="transactions")
    transaction_type = models.CharField(max_length=20, choices=Type.choices)
    quantity = models.DecimalField(
        max_digits=14, decimal_places=3,
        help_text="Signed change applied to quantity_on_hand (+ adds stock, - removes stock).",
    )
    balance_after = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    reference = models.CharField(max_length=100, blank=True, help_text="PO number, work order, batch, etc.")
    purchase_order = models.ForeignKey(
        "purchasing.PurchaseOrder", null=True, blank=True, on_delete=models.SET_NULL, related_name="transactions"
    )
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="stock_transactions"
    )

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["item", "created_at"]),
            models.Index(fields=["transaction_type"]),
        ]

    def __str__(self):
        return f"{self.get_transaction_type_display()} {self.quantity} x {self.item.sku}"


class MaterialConsumption(TimeStampedModel):
    """Material used in production / a project. Creates a consumption StockTransaction."""

    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name="consumptions")
    quantity = models.DecimalField(max_digits=14, decimal_places=3, validators=[MinValueValidator(Decimal("0.001"))])
    consumed_on = models.DateField()
    department = models.CharField(max_length=120, blank=True)
    work_order = models.CharField(max_length=100, blank=True, help_text="Job / project / work-order reference")
    purpose = models.CharField(max_length=255, blank=True)
    transaction = models.OneToOneField(
        StockTransaction, null=True, blank=True, on_delete=models.SET_NULL, related_name="consumption"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="consumptions"
    )

    class Meta:
        ordering = ["-consumed_on", "-id"]

    def __str__(self):
        return f"{self.quantity} {self.item.unit} of {self.item.sku} on {self.consumed_on}"


class LowStockAlert(TimeStampedModel):
    """Raised automatically when an item drops to/below its reorder level."""

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        ACKNOWLEDGED = "acknowledged", "Acknowledged"
        RESOLVED = "resolved", "Resolved"

    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name="alerts")
    quantity_at_alert = models.DecimalField(max_digits=14, decimal_places=3)
    reorder_level = models.DecimalField(max_digits=14, decimal_places=3)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.OPEN)
    acknowledged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="acknowledged_alerts"
    )
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    message = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.status}] {self.item.sku} at {self.quantity_at_alert}"
