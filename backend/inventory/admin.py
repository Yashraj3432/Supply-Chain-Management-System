from django.contrib import admin

from .models import Category, Item, LowStockAlert, MaterialConsumption, StockTransaction, Warehouse


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    search_fields = ("name",)


@admin.register(Warehouse)
class WarehouseAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "location", "is_active")


@admin.register(Item)
class ItemAdmin(admin.ModelAdmin):
    list_display = ("sku", "name", "category", "quantity_on_hand", "reorder_level", "unit", "unit_cost", "is_active")
    search_fields = ("sku", "name")
    list_filter = ("category", "is_active", "unit")
    readonly_fields = ("quantity_on_hand",)


@admin.register(StockTransaction)
class StockTransactionAdmin(admin.ModelAdmin):
    list_display = ("created_at", "item", "transaction_type", "quantity", "balance_after", "reference", "created_by")
    list_filter = ("transaction_type",)
    search_fields = ("item__sku", "reference")

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(MaterialConsumption)
class MaterialConsumptionAdmin(admin.ModelAdmin):
    list_display = ("consumed_on", "item", "quantity", "department", "work_order")
    search_fields = ("item__sku", "work_order", "department")


@admin.register(LowStockAlert)
class LowStockAlertAdmin(admin.ModelAdmin):
    list_display = ("created_at", "item", "quantity_at_alert", "reorder_level", "status")
    list_filter = ("status",)
