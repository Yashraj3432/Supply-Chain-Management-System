"""
Load realistic demo data.

    python manage.py seed_demo            # adds demo data (skips if items already exist)
    python manage.py seed_demo --reset    # wipes inventory/purchasing/supplier data first

Creates users:  admin / Admin@12345 (superuser), manager / Manager@12345 (staff), staff / Staff@12345
"""
import random
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from inventory.models import Category, Item, LowStockAlert, MaterialConsumption, StockTransaction, Warehouse
from inventory.services import apply_stock_movement, record_consumption, sync_low_stock_alert
from purchasing.models import PurchaseOrder, PurchaseOrderLine
from purchasing.services import change_status, receive_goods
from suppliers.models import Supplier

SUPPLIERS = [
    ("SUP-001", "Bharat Steel Traders", "Rakesh Mehta", "Mumbai", 7, "4.5"),
    ("SUP-002", "Precision Fasteners Pvt Ltd", "Anita Rao", "Pune", 5, "4.2"),
    ("SUP-003", "Shakti Polymers", "Vikram Joshi", "Ahmedabad", 10, "3.8"),
    ("SUP-004", "Eastern Electricals Co.", "Sourav Das", "Kolkata", 12, "4.0"),
    ("SUP-005", "Southern Packaging Solutions", "Lakshmi Iyer", "Chennai", 6, "4.7"),
    ("SUP-006", "Northline Chemicals", "Harpreet Kaur", "Ludhiana", 9, "3.5"),
]

CATEGORIES = ["Raw Materials", "Fasteners", "Electrical", "Packaging", "Chemicals", "Consumables"]

# sku, name, category, supplier code, unit, cost, opening qty, reorder level, reorder qty
ITEMS = [
    ("RM-STL-001", "MS Steel Sheet 2mm", "Raw Materials", "SUP-001", "kg", "68.50", 1200, 300, 1000),
    ("RM-STL-002", "SS 304 Rod 12mm", "Raw Materials", "SUP-001", "m", "245.00", 180, 50, 200),
    ("RM-ALU-001", "Aluminium Extrusion 6063", "Raw Materials", "SUP-001", "kg", "232.00", 90, 100, 300),
    ("FS-BLT-M8", "Hex Bolt M8 x 40", "Fasteners", "SUP-002", "pcs", "4.20", 5000, 1000, 5000),
    ("FS-NUT-M8", "Hex Nut M8", "Fasteners", "SUP-002", "pcs", "1.10", 650, 1000, 5000),
    ("FS-WSH-M8", "Flat Washer M8", "Fasteners", "SUP-002", "pcs", "0.60", 7400, 1500, 5000),
    ("FS-SCR-M4", "Pan Head Screw M4 x 12", "Fasteners", "SUP-002", "box", "180.00", 25, 10, 40),
    ("PL-ABS-001", "ABS Granules Black", "Raw Materials", "SUP-003", "kg", "142.00", 400, 150, 500),
    ("PL-PP-001", "PP Granules Natural", "Raw Materials", "SUP-003", "kg", "118.00", 60, 150, 500),
    ("EL-CBL-2.5", "Copper Cable 2.5 sq mm", "Electrical", "SUP-004", "m", "38.00", 1500, 500, 2000),
    ("EL-SW-001", "Toggle Switch 10A", "Electrical", "SUP-004", "pcs", "45.00", 320, 100, 500),
    ("EL-MCB-16", "MCB 16A Single Pole", "Electrical", "SUP-004", "pcs", "210.00", 0, 25, 100),
    ("PK-BOX-L", "Corrugated Box Large", "Packaging", "SUP-005", "pcs", "32.00", 900, 300, 1000),
    ("PK-BOX-M", "Corrugated Box Medium", "Packaging", "SUP-005", "pcs", "22.00", 1100, 300, 1000),
    ("PK-TAPE-48", "BOPP Tape 48mm", "Packaging", "SUP-005", "pcs", "38.00", 140, 50, 200),
    ("PK-WRAP-01", "Stretch Wrap Roll", "Packaging", "SUP-005", "pcs", "410.00", 8, 10, 30),
    ("CH-PNT-GRY", "Industrial Paint Grey", "Chemicals", "SUP-006", "l", "295.00", 120, 40, 150),
    ("CH-THN-001", "Paint Thinner", "Chemicals", "SUP-006", "l", "95.00", 75, 30, 100),
    ("CH-LUB-001", "Machine Lubricant Oil", "Chemicals", "SUP-006", "l", "180.00", 22, 25, 80),
    ("CN-GLV-001", "Nitrile Safety Gloves", "Consumables", "SUP-005", "box", "350.00", 40, 15, 50),
    ("CN-DSK-120", "Grinding Disc 4 inch", "Consumables", "SUP-002", "pcs", "28.00", 260, 100, 400),
    ("CN-WLD-ROD", "Welding Electrode 3.15mm", "Consumables", "SUP-001", "kg", "165.00", 55, 40, 150),
]

DEPARTMENTS = ["Fabrication", "Assembly", "Moulding", "Paint Shop", "Packing", "Maintenance"]


class Command(BaseCommand):
    help = "Seed the database with demo suppliers, items, purchase orders and consumption history."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Delete existing SCM data before seeding")

    def handle(self, *args, **options):
        random.seed(42)
        if options["reset"]:
            self._reset()
        elif Item.objects.exists():
            self.stdout.write(self.style.WARNING("Items already exist; skipping. Use --reset to wipe and reseed."))
            self._ensure_users()
            return

        users = self._ensure_users()
        with transaction.atomic():
            self._seed(users)
        self.stdout.write(self.style.SUCCESS("Demo data loaded."))
        self.stdout.write("Logins: admin / Admin@12345 · manager / Manager@12345 · staff / Staff@12345")

    def _reset(self):
        self.stdout.write("Removing existing data ...")
        MaterialConsumption.objects.all().delete()
        LowStockAlert.objects.all().delete()
        StockTransaction.objects.all().delete()
        PurchaseOrderLine.objects.all().delete()
        PurchaseOrder.objects.all().delete()
        Item.objects.all().delete()
        Category.objects.all().delete()
        Warehouse.objects.all().delete()
        Supplier.objects.all().delete()

    def _ensure_users(self):
        User = get_user_model()
        specs = [
            ("admin", "Admin@12345", True, True, "Admin", "User"),
            ("manager", "Manager@12345", True, False, "Priya", "Sharma"),
            ("staff", "Staff@12345", False, False, "Arjun", "Verma"),
        ]
        users = {}
        for username, pwd, is_staff, is_super, first, last in specs:
            user, created = User.objects.get_or_create(
                username=username,
                defaults={"email": f"{username}@scm.local", "is_staff": is_staff, "is_superuser": is_super,
                          "first_name": first, "last_name": last},
            )
            if created:
                user.set_password(pwd)
                user.save()
            users[username] = user
        return users

    def _backdate(self, obj_qs, when):
        obj_qs.update(created_at=when)

    def _seed(self, users):
        now = timezone.now()
        today = timezone.localdate()

        wh_main = Warehouse.objects.create(name="Main Warehouse", code="WH-01", location="Plant 1, Bhiwandi")
        wh_stores = Warehouse.objects.create(name="Production Stores", code="WH-02", location="Plant 1, Shop Floor")

        suppliers = {}
        for code, name, contact, city, lead, rating in SUPPLIERS:
            suppliers[code] = Supplier.objects.create(
                code=code, name=name, contact_person=contact, city=city, country="India",
                email=f"sales@{name.split()[0].lower()}.example.com",
                phone=f"+91 98{random.randint(10000000, 99999999)}",
                address=f"Industrial Area, {city}", lead_time_days=lead, rating=Decimal(rating),
            )

        categories = {name: Category.objects.create(name=name) for name in CATEGORIES}

        items = {}
        start = now - timedelta(days=150)
        for sku, name, cat, sup, unit, cost, opening, reorder, reorder_qty in ITEMS:
            item = Item.objects.create(
                sku=sku, name=name, category=categories[cat], preferred_supplier=suppliers[sup], unit=unit,
                unit_cost=Decimal(cost), reorder_level=Decimal(reorder), reorder_quantity=Decimal(reorder_qty),
                warehouse=wh_stores if cat in ("Consumables", "Fasteners") else wh_main,
            )
            items[sku] = item
            if opening:
                txn = apply_stock_movement(
                    item_id=item.pk, transaction_type=StockTransaction.Type.ADJUSTMENT,
                    quantity=Decimal(opening) * 2, user=users["admin"], reference="opening-stock",
                    notes="Opening balance", unit_cost=Decimal(cost),
                )
                StockTransaction.objects.filter(pk=txn.pk).update(created_at=start)

        # Purchase orders across the last ~5 months
        po_specs = [
            # supplier, days_ago, status, [(sku, qty, price)], receive_fraction
            ("SUP-001", 140, "received", [("RM-STL-001", 1000, "66.00"), ("RM-STL-002", 100, "240.00")], 1.0),
            ("SUP-002", 120, "received", [("FS-BLT-M8", 5000, "4.10"), ("FS-NUT-M8", 5000, "1.05")], 1.0),
            ("SUP-005", 100, "received", [("PK-BOX-L", 1000, "31.00"), ("PK-BOX-M", 1000, "21.50")], 1.0),
            ("SUP-004", 80, "received", [("EL-CBL-2.5", 2000, "37.50"), ("EL-SW-001", 300, "44.00")], 1.0),
            ("SUP-006", 60, "received", [("CH-PNT-GRY", 100, "290.00"), ("CH-THN-001", 80, "94.00")], 1.0),
            ("SUP-003", 45, "partially_received", [("PL-ABS-001", 500, "140.00"), ("PL-PP-001", 500, "117.00")], 0.5),
            ("SUP-001", 20, "approved", [("RM-ALU-001", 300, "230.00"), ("CN-WLD-ROD", 100, "162.00")], 0),
            ("SUP-004", 12, "submitted", [("EL-MCB-16", 100, "205.00")], 0),
            ("SUP-005", 5, "draft", [("PK-WRAP-01", 30, "405.00"), ("PK-TAPE-48", 200, "37.00")], 0),
            ("SUP-002", 3, "draft", [("FS-SCR-M4", 40, "178.00")], 0),
        ]
        for sup, days_ago, target, lines, fraction in po_specs:
            order_date = today - timedelta(days=days_ago)
            po = PurchaseOrder.objects.create(
                supplier=suppliers[sup], order_date=order_date,
                expected_date=order_date + timedelta(days=suppliers[sup].lead_time_days),
                tax_percent=Decimal("18.00"), shipping_cost=Decimal(random.choice([0, 500, 1200])),
                created_by=users["manager"], notes="Demo purchase order",
            )
            for sku, qty, price in lines:
                PurchaseOrderLine.objects.create(
                    purchase_order=po, item=items[sku], quantity_ordered=Decimal(qty), unit_price=Decimal(price)
                )
            if target == "draft":
                continue
            change_status(po, PurchaseOrder.Status.SUBMITTED, users["manager"])
            if target == "submitted":
                continue
            change_status(po, PurchaseOrder.Status.APPROVED, users["admin"])
            if fraction > 0:
                receipts = [
                    {"line": line.pk, "quantity": (line.quantity_ordered * Decimal(str(fraction))).quantize(Decimal("1"))}
                    for line in po.lines.all()
                ]
                receive_goods(po, receipts, users["staff"])
                received_at = now - timedelta(days=days_ago - suppliers[sup].lead_time_days + random.choice([-1, 0, 2]))
                StockTransaction.objects.filter(purchase_order=po).update(created_at=received_at)
                if target == "received":
                    PurchaseOrder.objects.filter(pk=po.pk).update(received_date=received_at.date())

        # Consumption history spread over the last 150 days
        consumable = list(Item.objects.filter(quantity_on_hand__gt=0))
        for day in range(150, 0, -3):
            for _ in range(random.randint(1, 3)):
                item = random.choice(consumable)
                item.refresh_from_db()
                available = item.quantity_on_hand - item.reorder_level * Decimal("0.6")
                if available <= 1:
                    continue
                qty = (available * Decimal(random.uniform(0.03, 0.12))).quantize(Decimal("1"))
                if qty <= 0:
                    continue
                when = today - timedelta(days=day)
                dept = random.choice(DEPARTMENTS)
                c = record_consumption(
                    item_id=item.pk, quantity=qty, consumed_on=when, user=users["staff"], department=dept,
                    work_order=f"WO-{when:%y%m}-{random.randint(100, 999)}", purpose=f"{dept} production run",
                )
                StockTransaction.objects.filter(pk=c.transaction_id).update(
                    created_at=timezone.make_aware(timezone.datetime(when.year, when.month, when.day, 11, 0))
                )

        # Push a few items below reorder to demonstrate alerts
        for sku, qty in [("FS-NUT-M8", None), ("PL-PP-001", None), ("CH-LUB-001", None), ("PK-WRAP-01", None)]:
            item = Item.objects.get(sku=sku)
            target_level = (item.reorder_level * Decimal("0.5")).quantize(Decimal("1"))
            diff = item.quantity_on_hand - target_level
            if diff > 0:
                record_consumption(
                    item_id=item.pk, quantity=diff, consumed_on=today, user=users["staff"],
                    department="Assembly", work_order=f"WO-{today:%y%m}-777", purpose="Large production batch",
                )
        # Zero out one item to show out-of-stock
        mcb = Item.objects.get(sku="EL-MCB-16")
        if mcb.quantity_on_hand > 0:
            apply_stock_movement(item_id=mcb.pk, transaction_type=StockTransaction.Type.ADJUSTMENT,
                                 quantity=-mcb.quantity_on_hand, user=users["admin"], reference="stock-count",
                                 notes="Cycle count correction")

        for item in Item.objects.filter(is_active=True):
            sync_low_stock_alert(item)
