from django.contrib import admin

from .models import PurchaseOrder, PurchaseOrderLine


class PurchaseOrderLineInline(admin.TabularInline):
    model = PurchaseOrderLine
    extra = 0
    readonly_fields = ("quantity_received",)


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display = ("po_number", "supplier", "status", "order_date", "expected_date")
    list_filter = ("status", "supplier")
    search_fields = ("po_number", "supplier__name")
    readonly_fields = ("po_number", "status", "approved_by", "approved_at", "received_date")
    inlines = [PurchaseOrderLineInline]
