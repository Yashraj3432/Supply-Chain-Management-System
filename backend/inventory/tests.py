from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from inventory.models import Item, LowStockAlert, StockTransaction
from purchasing.models import PurchaseOrder
from suppliers.models import Supplier


class SCMApiTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("tester", password="Pass@12345", is_staff=True)
        self.client = APIClient()
        resp = self.client.post("/api/auth/login/", {"username": "tester", "password": "Pass@12345"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.content)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['access']}")
        self.supplier = Supplier.objects.create(name="Acme", code="SUP-X")

    def _create_item(self, **extra):
        payload = {"sku": "abc-1", "name": "Widget", "unit": "pcs", "unit_cost": "10.00",
                   "reorder_level": "5", "reorder_quantity": "20", "preferred_supplier": self.supplier.id}
        payload.update(extra)
        resp = self.client.post("/api/items/", payload, format="json")
        self.assertEqual(resp.status_code, 201, resp.content)
        return resp.data

    def test_auth_required(self):
        self.assertEqual(APIClient().get("/api/items/").status_code, 401)

    def test_item_create_with_opening_stock(self):
        data = self._create_item(opening_quantity="12")
        self.assertEqual(data["sku"], "ABC-1")
        self.assertEqual(Decimal(data["quantity_on_hand"]), Decimal("12"))
        self.assertEqual(StockTransaction.objects.count(), 1)
        self.assertFalse(LowStockAlert.objects.exists())

    def test_consumption_reduces_stock_and_raises_alert(self):
        item = self._create_item(opening_quantity="10")
        resp = self.client.post("/api/consumptions/", {"item": item["id"], "quantity": "6",
                                                       "consumed_on": "2026-10-01", "department": "Assembly"}, format="json")
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(Item.objects.get(pk=item["id"]).quantity_on_hand, Decimal("4"))
        self.assertEqual(LowStockAlert.objects.filter(status="open").count(), 1)

    def test_cannot_consume_more_than_on_hand(self):
        item = self._create_item(opening_quantity="3")
        resp = self.client.post("/api/consumptions/", {"item": item["id"], "quantity": "5",
                                                       "consumed_on": "2026-10-01"}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(Item.objects.get(pk=item["id"]).quantity_on_hand, Decimal("3"))
        self.assertEqual(StockTransaction.objects.filter(transaction_type="consumption").count(), 0)

    def test_purchase_order_workflow_and_receiving(self):
        item = self._create_item()  # 0 on hand -> alert opened
        self.assertEqual(LowStockAlert.objects.filter(status="open").count(), 1)
        resp = self.client.post("/api/purchase-orders/", {
            "supplier": self.supplier.id, "tax_percent": "18",
            "lines": [{"item": item["id"], "quantity_ordered": "20", "unit_price": "12.50"}],
        }, format="json")
        self.assertEqual(resp.status_code, 201, resp.content)
        po_id = resp.data["id"]
        self.assertTrue(resp.data["po_number"].startswith("PO-"))
        self.assertEqual(Decimal(resp.data["total"]), Decimal("295.00"))

        # cannot receive a draft
        line_id = resp.data["lines"][0]["id"]
        bad = self.client.post(f"/api/purchase-orders/{po_id}/receive/", {"receipts": [{"line": line_id, "quantity": "5"}]}, format="json")
        self.assertEqual(bad.status_code, 400)

        for s in ("submitted", "approved"):
            r = self.client.post(f"/api/purchase-orders/{po_id}/status/", {"status": s}, format="json")
            self.assertEqual(r.status_code, 200, r.content)

        r = self.client.post(f"/api/purchase-orders/{po_id}/receive/", {"receipts": [{"line": line_id, "quantity": "8"}]}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["status"], "partially_received")

        over = self.client.post(f"/api/purchase-orders/{po_id}/receive/", {"receipts": [{"line": line_id, "quantity": "50"}]}, format="json")
        self.assertEqual(over.status_code, 400)

        r = self.client.post(f"/api/purchase-orders/{po_id}/receive/", {"receipts": [{"line": line_id, "quantity": "12"}]}, format="json")
        self.assertEqual(r.data["status"], "received")
        it = Item.objects.get(pk=item["id"])
        self.assertEqual(it.quantity_on_hand, Decimal("20"))
        self.assertEqual(it.unit_cost, Decimal("12.50"))
        self.assertEqual(LowStockAlert.objects.filter(status="open").count(), 0)
        self.assertEqual(PurchaseOrder.objects.get(pk=po_id).status, "received")

    def test_search_and_low_stock_filter(self):
        self._create_item(sku="BOLT-1", name="Bolt", opening_quantity="100")
        self._create_item(sku="NUT-1", name="Nut", opening_quantity="1")
        r = self.client.get("/api/items/?search=bolt")
        self.assertEqual(r.data["count"], 1)
        r = self.client.get("/api/items/?low_stock=true")
        self.assertEqual([i["sku"] for i in r.data["results"]], ["NUT-1"])

    def test_reports(self):
        self._create_item(opening_quantity="10")
        for url in ["/api/reports/dashboard/", "/api/reports/stock-valuation/", "/api/reports/consumption/",
                    "/api/reports/purchases/", "/api/reports/movement/"]:
            r = self.client.get(url)
            self.assertEqual(r.status_code, 200, (url, r.content))
        r = self.client.get("/api/reports/stock-valuation/?export=csv")
        self.assertEqual(r["Content-Type"], "text/csv")
        self.assertIn(b"ABC-1", r.content)
