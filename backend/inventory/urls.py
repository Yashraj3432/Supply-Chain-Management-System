from rest_framework.routers import DefaultRouter

from .views import (
    CategoryViewSet,
    ItemViewSet,
    LowStockAlertViewSet,
    MaterialConsumptionViewSet,
    StockTransactionViewSet,
    WarehouseViewSet,
)

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="category")
router.register("warehouses", WarehouseViewSet, basename="warehouse")
router.register("items", ItemViewSet, basename="item")
router.register("transactions", StockTransactionViewSet, basename="transaction")
router.register("consumptions", MaterialConsumptionViewSet, basename="consumption")
router.register("alerts", LowStockAlertViewSet, basename="alert")

urlpatterns = router.urls
