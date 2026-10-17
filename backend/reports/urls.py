from django.urls import path

from .views import ConsumptionReport, DashboardView, MovementReport, PurchaseReport, StockValuationReport

urlpatterns = [
    path("dashboard/", DashboardView.as_view(), name="report-dashboard"),
    path("stock-valuation/", StockValuationReport.as_view(), name="report-stock-valuation"),
    path("consumption/", ConsumptionReport.as_view(), name="report-consumption"),
    path("purchases/", PurchaseReport.as_view(), name="report-purchases"),
    path("movement/", MovementReport.as_view(), name="report-movement"),
]
