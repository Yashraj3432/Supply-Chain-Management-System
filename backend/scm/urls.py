from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def health(_request):
    return JsonResponse({"status": "ok", "service": "scm-backend"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health, name="health"),
    path("api/auth/", include("accounts.urls")),
    path("api/", include("suppliers.urls")),
    path("api/", include("inventory.urls")),
    path("api/", include("purchasing.urls")),
    path("api/reports/", include("reports.urls")),
]
