from django.urls import path

from . import views

urlpatterns = [
    path("session/", views.session_view),
    path("demo/open/", views.demo_open),
    path("demo/advance/", views.demo_advance),
    path("demo/reset/", views.demo_reset),
    path("auth/login/", views.login_view),
    path("auth/logout/", views.logout_view),
    path("dashboard/", views.dashboard),
    path("routes/", views.routes_view),
    path("routes/<int:route_id>/", views.route_detail),
    path("routes/<int:route_id>/confirm/", views.route_confirm),
    path("routes/<int:route_id>/assign/", views.route_assign),
    path("routes/<int:route_id>/comments/", views.route_comment),
    path("routes/<int:route_id>/contact/", views.route_contact),
    path("steps/<int:step_id>/book/", views.step_book),
    path("steps/<int:step_id>/complete/", views.step_complete),
    path("steps/<int:step_id>/documents/", views.step_document),
    path("appointments/<int:appointment_id>/status/", views.appointment_status),
    path("schedule/", views.schedule),
    path("employees/", views.employees),
    path("tasks/", views.tasks_view),
    path("tasks/<int:task_id>/complete/", views.task_complete),
]
