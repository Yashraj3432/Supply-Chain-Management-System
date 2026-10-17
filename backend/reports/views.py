"""Reporting endpoints. All read-only; most accept ?start=YYYY-MM-DD&end=YYYY-MM-DD and ?format=csv."""
import csv
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.db.models import Count, DecimalField, ExpressionWrapper, F, Q, Sum
from django.db.models.functions import Coalesce, TruncMonth
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.response import Response
from rest_framework.views import APIView

from inventory.models import Category, Item, LowStockAlert, MaterialConsumption, StockTransaction
from purchasing.models import PurchaseOrder, PurchaseOrderLine
from suppliers.models import Supplier

ZERO = Decimal("0")
MONEY = DecimalField(max_digits=18, decimal_places=2)


def _date_range(request, default_days=30):
    today = timezone.localdate()
    start = parse_date(request.query_params.get("start", "") or "") or today - timedelta(days=default_days)
    end = parse_date(request.query_params.get("end", "") or "") or today
    if start > end:
        start, end = end, start
    return start, end


def _day_start(d: date):
    """Aware datetime at local midnight. Comparing on datetimes avoids MySQL CONVERT_TZ
    (which needs timezone tables loaded on the server)."""
    return timezone.make_aware(datetime.combine(d, time.min))


def _datetime_range(start: date, end: date):
    return _day_start(start), _day_start(end + timedelta(days=1))


def _money(value) -> Decimal:
    return Decimal(value or 0).quantize(Decimal("0.01"))


def _qty(value) -> Decimal:
    return Decimal(value or 0).quantize(Decimal("0.001"))


def _csv_response(filename: str, header: list[str], rows: list[list]) -> HttpResponse:
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    writer = csv.writer(response)
    writer.writerow(header)
    writer.writerows(rows)
    return response


def _wants_csv(request) -> bool:
    return request.query_params.get("export") == "csv"


def _stock_value_expr():
    return ExpressionWrapper(F("quantity_on_hand") * F("unit_cost"), output_field=MONEY)


class DashboardView(APIView):
    """Headline numbers for the dashboard."""

    def get(self, request):
        today = timezone.localdate()
        month_start = today.replace(day=1)
        items = Item.objects.filter(is_active=True)

        stock_value = items.aggregate(v=Coalesce(Sum(_stock_value_expr()), ZERO, output_field=MONEY))["v"]
        low_stock = items.filter(quantity_on_hand__lte=F("reorder_level"))
        open_pos = PurchaseOrder.objects.filter(status__in=PurchaseOrder.OPEN_STATUSES)
        overdue_pos = open_pos.filter(expected_date__lt=today).exclude(status=PurchaseOrder.Status.DRAFT)

        purchase_value_month = PurchaseOrderLine.objects.filter(
            purchase_order__order_date__gte=month_start,
        ).exclude(purchase_order__status=PurchaseOrder.Status.CANCELLED).aggregate(
            v=Coalesce(Sum(ExpressionWrapper(F("quantity_ordered") * F("unit_price"), output_field=MONEY)), ZERO, output_field=MONEY)
        )["v"]

        consumption_month = StockTransaction.objects.filter(
            transaction_type=StockTransaction.Type.CONSUMPTION, created_at__gte=_day_start(month_start)
        ).aggregate(
            v=Coalesce(Sum(ExpressionWrapper(-F("quantity") * F("unit_cost"), output_field=MONEY)), ZERO, output_field=MONEY)
        )["v"]

        # 6-month movement trend (inbound vs outbound value)
        six_months_ago = (month_start - timedelta(days=150)).replace(day=1)
        buckets = {}
        cursor = six_months_ago
        while cursor <= today:
            buckets[cursor.strftime("%Y-%m")] = {"inbound": ZERO, "outbound": ZERO}
            cursor = (cursor + timedelta(days=32)).replace(day=1)
        for created_at, qty, cost in StockTransaction.objects.filter(
            created_at__gte=_day_start(six_months_ago)
        ).values_list("created_at", "quantity", "unit_cost"):
            key = timezone.localtime(created_at).strftime("%Y-%m")
            if key not in buckets:
                continue
            value = (qty or ZERO) * (cost or ZERO)
            if value >= 0:
                buckets[key]["inbound"] += value
            else:
                buckets[key]["outbound"] -= value
        trend = [
            {"month": k, "inbound": _money(v["inbound"]), "outbound": _money(v["outbound"])}
            for k, v in buckets.items()
        ]

        recent = StockTransaction.objects.select_related("item").order_by("-created_at", "-id")[:8]
        status_counts = dict(PurchaseOrder.objects.values_list("status").annotate(c=Count("id")))

        return Response({
            "totals": {
                "items": items.count(),
                "suppliers": Supplier.objects.filter(is_active=True).count(),
                "stock_value": _money(stock_value),
                "low_stock_items": low_stock.count(),
                "out_of_stock_items": items.filter(quantity_on_hand__lte=0).count(),
                "open_alerts": LowStockAlert.objects.filter(status=LowStockAlert.Status.OPEN).count(),
                "open_purchase_orders": open_pos.count(),
                "overdue_purchase_orders": overdue_pos.count(),
                "purchase_value_this_month": _money(purchase_value_month),
                "consumption_value_this_month": _money(consumption_month),
            },
            "po_status_counts": {s: status_counts.get(s, 0) for s, _ in PurchaseOrder.Status.choices},
            "movement_trend": trend,
            "low_stock": [
                {
                    "id": i.id, "sku": i.sku, "name": i.name, "unit": i.unit,
                    "quantity_on_hand": i.quantity_on_hand, "reorder_level": i.reorder_level,
                }
                for i in low_stock.order_by("quantity_on_hand")[:8]
            ],
            "recent_transactions": [
                {
                    "id": t.id, "created_at": t.created_at, "sku": t.item.sku, "item_name": t.item.name,
                    "transaction_type": t.transaction_type, "type_display": t.get_transaction_type_display(),
                    "quantity": t.quantity, "balance_after": t.balance_after, "reference": t.reference,
                }
                for t in recent
            ],
        })


class StockValuationReport(APIView):
    """Current stock on hand and value, grouped per item with category totals."""

    def get(self, request):
        qs = (
            Item.objects.filter(is_active=True)
            .select_related("category", "warehouse")
            .annotate(value=_stock_value_expr())
            .order_by("category__name", "name")
        )
        if request.query_params.get("category"):
            qs = qs.filter(category_id=request.query_params["category"])

        rows = [
            {
                "id": i.id, "sku": i.sku, "name": i.name,
                "category": i.category.name if i.category else "Uncategorised",
                "warehouse": i.warehouse.name if i.warehouse else "",
                "unit": i.unit, "quantity_on_hand": i.quantity_on_hand, "unit_cost": i.unit_cost,
                "value": _money(i.value), "reorder_level": i.reorder_level, "is_low_stock": i.is_low_stock,
            }
            for i in qs
        ]
        by_category = (
            Category.objects.annotate(
                value=Coalesce(
                    Sum(ExpressionWrapper(F("items__quantity_on_hand") * F("items__unit_cost"), output_field=MONEY),
                        filter=Q(items__is_active=True)),
                    ZERO, output_field=MONEY,
                ),
                item_count=Count("items", filter=Q(items__is_active=True)),
            ).values("id", "name", "value", "item_count").order_by("-value")
        )
        total = sum((r["value"] for r in rows), ZERO)

        if _wants_csv(request):
            return _csv_response(
                f"stock-valuation-{timezone.localdate()}.csv",
                ["SKU", "Item", "Category", "Warehouse", "Unit", "Qty on hand", "Unit cost", "Value", "Reorder level", "Low stock"],
                [[r["sku"], r["name"], r["category"], r["warehouse"], r["unit"], r["quantity_on_hand"],
                  r["unit_cost"], r["value"], r["reorder_level"], "YES" if r["is_low_stock"] else ""] for r in rows],
            )
        return Response({
            "total_value": _money(total),
            "by_category": [{**c, "value": _money(c["value"])} for c in by_category],
            "items": rows,
        })


class ConsumptionReport(APIView):
    """Material consumption in a date range, by item and by department."""

    def get(self, request):
        start, end = _date_range(request)
        qs = MaterialConsumption.objects.filter(consumed_on__range=(start, end)).select_related("item", "transaction")
        cost_expr = ExpressionWrapper(F("quantity") * Coalesce(F("transaction__unit_cost"), F("item__unit_cost")), output_field=MONEY)

        by_item = (
            qs.values("item_id", "item__sku", "item__name", "item__unit")
            .annotate(total_qty=Sum("quantity"), cost=Coalesce(Sum(cost_expr), ZERO, output_field=MONEY), entries=Count("id"))
            .order_by("-cost")
        )
        by_department = (
            qs.values("department")
            .annotate(cost=Coalesce(Sum(cost_expr), ZERO, output_field=MONEY), entries=Count("id"))
            .order_by("-cost")
        )
        by_item = [
            {"item": r["item_id"], "sku": r["item__sku"], "name": r["item__name"], "unit": r["item__unit"],
             "quantity": _qty(r["total_qty"]), "cost": _money(r["cost"]), "entries": r["entries"]}
            for r in by_item
        ]
        total_cost = sum((r["cost"] for r in by_item), ZERO)

        if _wants_csv(request):
            return _csv_response(
                f"consumption-{start}-to-{end}.csv",
                ["SKU", "Item", "Unit", "Quantity consumed", "Cost", "Entries"],
                [[r["sku"], r["name"], r["unit"], r["quantity"], r["cost"], r["entries"]] for r in by_item],
            )
        return Response({
            "start": start, "end": end, "total_cost": _money(total_cost),
            "by_item": by_item,
            "by_department": [{"department": r["department"] or "Unassigned", "cost": _money(r["cost"]), "entries": r["entries"]} for r in by_department],
        })


class PurchaseReport(APIView):
    """Purchase spend per supplier and supplier delivery performance."""

    def get(self, request):
        start, end = _date_range(request, default_days=90)
        pos = PurchaseOrder.objects.filter(order_date__range=(start, end)).exclude(status=PurchaseOrder.Status.CANCELLED)
        line_value = ExpressionWrapper(F("lines__quantity_ordered") * F("lines__unit_price"), output_field=MONEY)

        by_supplier = (
            pos.values("supplier_id", "supplier__name")
            .annotate(order_count=Count("id", distinct=True), spend=Coalesce(Sum(line_value), ZERO, output_field=MONEY))
            .order_by("-spend")
        )

        # On-time delivery: received orders where received_date <= expected_date
        received = pos.filter(status=PurchaseOrder.Status.RECEIVED, expected_date__isnull=False, received_date__isnull=False)
        perf = {}
        for po in received.values("supplier_id", "expected_date", "received_date"):
            s = perf.setdefault(po["supplier_id"], {"received": 0, "on_time": 0})
            s["received"] += 1
            if po["received_date"] <= po["expected_date"]:
                s["on_time"] += 1

        rows = []
        for r in by_supplier:
            p = perf.get(r["supplier_id"], {"received": 0, "on_time": 0})
            rows.append({
                "supplier": r["supplier_id"], "name": r["supplier__name"], "order_count": r["order_count"],
                "spend": _money(r["spend"]), "received_orders": p["received"],
                "on_time_rate": round(p["on_time"] * 100 / p["received"], 1) if p["received"] else None,
            })

        by_month = (
            pos.annotate(month=TruncMonth("order_date")).values("month")
            .annotate(spend=Coalesce(Sum(line_value), ZERO, output_field=MONEY), orders=Count("id", distinct=True))
            .order_by("month")
        )
        total = sum((r["spend"] for r in rows), ZERO)

        if _wants_csv(request):
            return _csv_response(
                f"purchases-{start}-to-{end}.csv",
                ["Supplier", "Orders", "Spend", "Received orders", "On-time %"],
                [[r["name"], r["order_count"], r["spend"], r["received_orders"],
                  "" if r["on_time_rate"] is None else r["on_time_rate"]] for r in rows],
            )
        return Response({
            "start": start, "end": end, "total_spend": _money(total), "by_supplier": rows,
            "by_month": [{"month": (r["month"].strftime("%Y-%m") if isinstance(r["month"], date) else str(r["month"])[:7]),
                          "spend": _money(r["spend"]), "orders": r["orders"]} for r in by_month],
        })


class MovementReport(APIView):
    """Stock movement summary per item: opening, in, out, closing for a date range."""

    def get(self, request):
        start, end = _date_range(request)
        range_start, range_end = _datetime_range(start, end)
        txns = StockTransaction.objects.filter(created_at__gte=range_start, created_at__lt=range_end)
        movement = {
            r["item_id"]: r
            for r in txns.values("item_id").annotate(
                inbound=Coalesce(Sum("quantity", filter=Q(quantity__gt=0)), ZERO, output_field=MONEY),
                outbound=Coalesce(Sum("quantity", filter=Q(quantity__lt=0)), ZERO, output_field=MONEY),
            )
        }
        after_end = {
            r["item_id"]: r["delta"]
            for r in StockTransaction.objects.filter(created_at__gte=range_end)
            .values("item_id").annotate(delta=Sum("quantity"))
        }
        rows = []
        for item in Item.objects.filter(is_active=True).order_by("sku"):
            m = movement.get(item.id, {"inbound": ZERO, "outbound": ZERO})
            closing = item.quantity_on_hand - (after_end.get(item.id) or ZERO)
            opening = closing - m["inbound"] - m["outbound"]
            if not (m["inbound"] or m["outbound"]) and request.query_params.get("only_moved") == "true":
                continue
            rows.append({
                "item": item.id, "sku": item.sku, "name": item.name, "unit": item.unit,
                "opening": _qty(opening), "inbound": _qty(m["inbound"]), "outbound": _qty(-m["outbound"]), "closing": _qty(closing),
            })

        if _wants_csv(request):
            return _csv_response(
                f"stock-movement-{start}-to-{end}.csv",
                ["SKU", "Item", "Unit", "Opening", "In", "Out", "Closing"],
                [[r["sku"], r["name"], r["unit"], r["opening"], r["inbound"], r["outbound"], r["closing"]] for r in rows],
            )
        return Response({"start": start, "end": end, "items": rows})
