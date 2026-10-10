from django.contrib import admin
from django.urls import include, path, re_path

from core.views import health, spa

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health),
    path("api/", include("core.urls")),
    path("", spa),
    re_path(r"^app(?:/.*)?$", spa),
]
