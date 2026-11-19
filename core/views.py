from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
from urllib.parse import quote

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.core.paginator import Paginator
from django.db import transaction
from django.db.models import Count, Prefetch, Q
from django.http import FileResponse, Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .demo import create_demo_workspace
from .exceptions import DomainError
from .models import Appointment, Comment, ContactResult, Document, Employee, Membership, Patient, Route, RouteStep, ScheduleSlot, Study, Task, Workspace
from .serializers import EmployeeSerializer, PatientDetailSerializer, PatientListSerializer, RouteDetailSerializer, RouteListSerializer, SlotSerializer, TaskSerializer
from .services import add_document, assign_route, author_name, audit, book_slot, complete_step, confirm_route, create_approved_demo_route, ensure_follow_up_task, patient_operational_info, priority_info, public_demo_route_plans, register_patient, save_contact
from .workspace import cleanup_expired_demo_workspaces, get_workspace


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    return Response({"status": "ok", "service": "routeguard"})


@ensure_csrf_cookie
def spa(request):
    index_file = Path(settings.BASE_DIR) / "backend_static" / "app" / "index.html"
    if not index_file.exists():
        raise Http404("Frontend is not built")
    return FileResponse(index_file.open("rb"), content_type="text/html; charset=utf-8")


def session_payload(request, workspace):
    membership = Membership.objects.filter(user=request.user, workspace=workspace).first() if request.user.is_authenticated else None
    return {
        "authenticated": request.user.is_authenticated,
        "user": {"username": request.user.username, "name": request.user.get_full_name() or request.user.username} if request.user.is_authenticated else None,
        "workspace": {"id": str(workspace.id), "name": workspace.name, "kind": workspace.kind, "demo_date": workspace.demo_date, "expires_at": workspace.expires_at} if workspace else None,
        "role": membership.role if membership else ("demo" if workspace else None),
    }


@api_view(["GET"])
@permission_classes([AllowAny])
def session_view(request):
    return Response(session_payload(request, get_workspace(request, required=False)))


@api_view(["POST"])
@permission_classes([AllowAny])
def demo_open(request):
    cleanup_expired_demo_workspaces()
    old = get_workspace(request, required=False)
    if old and old.kind == Workspace.Kind.DEMO:
        return Response(session_payload(request, old))
    workspace = create_demo_workspace()
    request.session["routeguard_workspace_id"] = str(workspace.id)
    request.session.cycle_key()
    return Response(session_payload(request, workspace), status=201)


@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    user = authenticate(request, username=request.data.get("username", ""), password=request.data.get("password", ""))
    if user is None:
        raise DomainError("Неверный логин или пароль.", code="invalid_credentials", status_code=401)
    membership = Membership.objects.select_related("workspace").filter(user=user).first()
    if membership is None:
        raise DomainError("Пользователю не назначено рабочее пространство.", code="workspace_required", status_code=403)
    login(request, user)
    request.session.pop("routeguard_workspace_id", None)
    return Response(session_payload(request, membership.workspace))


@api_view(["POST"])
@permission_classes([AllowAny])
def logout_view(request):
    logout(request)
    return Response({"ok": True})


def route_queryset(workspace):
    return (
        Route.objects.filter(workspace=workspace)
        .select_related("workspace", "patient", "study", "assignee")
        .prefetch_related(
            "steps__service",
            "steps__appointments__slot__facility",
            "steps__appointments__slot__specialist",
            "steps__documents",
            Prefetch("tasks", queryset=Task.objects.select_related("route__patient", "assignee")),
            Prefetch("contacts", queryset=ContactResult.objects.select_related("employee").order_by("-created_at", "-id")),
            "events",
            "comments",
        )
    )


def patient_queryset(workspace):
    return Patient.objects.filter(workspace=workspace).prefetch_related(
        Prefetch("routes", queryset=route_queryset(workspace).order_by("created_at", "id"))
    )


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def patients_view(request):
    workspace = get_workspace(request)
    if request.method == "POST":
        patient = register_patient(
            workspace,
            request.data.get("full_name", ""),
            request.data.get("birth_date"),
            request.user,
        )
        return Response(PatientDetailSerializer(patient_queryset(workspace).get(pk=patient.id)).data, status=201)
    queryset = patient_queryset(workspace)
    search = request.query_params.get("search", "").strip()
    if len(search) > 180:
        raise DomainError("Поисковый запрос слишком длинный.")
    if search:
        queryset = queryset.filter(Q(full_name__icontains=search) | Q(code__icontains=search))
    elif request.query_params.get("featured") == "1":
        queryset = queryset.order_by("code", "id")
    elif request.query_params.get("registry") != "1":
        return Response({"results": [], "count": 0, "page": 1, "page_size": 10, "total_pages": 0})

    try:
        page_size = int(request.query_params.get("page_size", 10))
        page_number = int(request.query_params.get("page", 1))
    except (TypeError, ValueError):
        raise DomainError("Параметры страницы должны быть целыми числами.")
    if page_size < 1 or page_size > 50 or page_number < 1:
        raise DomainError("Номер страницы должен быть положительным, размер страницы — от 1 до 50.")
    if request.query_params.get("featured") == "1":
        page_size = min(page_size, 3)

    status_filter = request.query_params.get("status", "all")
    priority_filter = request.query_params.get("priority", "all")
    sort = request.query_params.get("sort", "alpha")
    if status_filter not in {"all", "active", "attention", "completed"}:
        raise DomainError("Неизвестный фильтр статуса.")
    if priority_filter not in {"all", "high", "medium", "low"}:
        raise DomainError("Неизвестный фильтр приоритета.")
    if sort not in {"alpha", "deadline", "priority"}:
        raise DomainError("Неизвестный порядок сортировки.")

    patients = list(queryset)
    for patient in patients:
        patient_operational_info(patient)
    status_facets = {
        "active": sum(patient._operational_info["status"] in {Route.Status.DRAFT, Route.Status.ACTIVE} for patient in patients),
        "attention": sum(patient._operational_info["requires_attention"] for patient in patients),
        "completed": sum(patient._operational_info["status"] == Route.Status.COMPLETED for patient in patients),
    }
    priority_facets = {
        category: sum(patient._operational_info["priority"]["category"] == category for patient in patients)
        for category in ("high", "medium", "low")
    }

    if status_filter == "active":
        patients = [patient for patient in patients if patient._operational_info["status"] in {Route.Status.DRAFT, Route.Status.ACTIVE}]
    elif status_filter == "attention":
        patients = [patient for patient in patients if patient._operational_info["requires_attention"]]
    elif status_filter == "completed":
        patients = [patient for patient in patients if patient._operational_info["status"] == Route.Status.COMPLETED]
    if priority_filter != "all":
        patients = [patient for patient in patients if patient._operational_info["priority"]["category"] == priority_filter]

    name_key = lambda patient: (patient.full_name.casefold(), patient.code, patient.id)
    if request.query_params.get("featured") == "1":
        patients.sort(key=lambda patient: (patient.code, patient.id))
    elif sort == "deadline":
        patients.sort(
            key=lambda patient: (
                patient._operational_info["due_date"] is None,
                patient._operational_info["due_date"] or date.max,
                *name_key(patient),
            )
        )
    elif sort == "priority":
        patients.sort(key=lambda patient: (-patient._operational_info["priority"]["score"], *name_key(patient)))
    else:
        patients.sort(key=name_key)

    paginator = Paginator(patients, page_size)
    page = paginator.get_page(page_number)
    return Response(
        {
            "results": PatientListSerializer(page.object_list, many=True).data,
            "count": paginator.count,
            "page": page.number,
            "page_size": page_size,
            "total_pages": paginator.num_pages if paginator.count else 0,
            "facets": {"statuses": status_facets, "priorities": priority_facets},
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def patient_detail(request, patient_id):
    workspace = get_workspace(request)
    patient = get_object_or_404(patient_queryset(workspace), pk=patient_id)
    return Response(PatientDetailSerializer(patient).data)


@api_view(["GET"])
@permission_classes([AllowAny])
def route_plans(request):
    workspace = get_workspace(request)
    return Response(public_demo_route_plans() if workspace.kind == Workspace.Kind.DEMO else [])


@api_view(["POST"])
@permission_classes([AllowAny])
def patient_create_route(request, patient_id):
    workspace = get_workspace(request)
    get_object_or_404(Patient, pk=patient_id, workspace=workspace)
    route = create_approved_demo_route(workspace, patient_id, request.data.get("plan_id", ""), request.user)
    return Response(RouteDetailSerializer(route_queryset(workspace).get(pk=route.id)).data, status=201)


@api_view(["GET"])
@permission_classes([AllowAny])
def dashboard(request):
    workspace = get_workspace(request)
    today = workspace.demo_date if workspace.kind == Workspace.Kind.DEMO else timezone.localdate()
    routes = list(route_queryset(workspace))
    active = [route for route in routes if route.status in {Route.Status.DRAFT, Route.Status.ACTIVE}]
    prioritized = sorted(active, key=lambda route: (-priority_info(route)["score"], route.due_date, route.id))[:8]
    status_counts = {item["status"]: item["total"] for item in Route.objects.filter(workspace=workspace).values("status").annotate(total=Count("id"))}
    attention_counts = {item["attention_reason"] or "none": item["total"] for item in Route.objects.filter(workspace=workspace).values("attention_reason").annotate(total=Count("id"))}
    route_metrics = Route.objects.filter(workspace=workspace).aggregate(
        eligible_routes=Count("id", filter=~Q(status=Route.Status.CANCELLED)),
        completed_routes=Count("id", filter=Q(status=Route.Status.COMPLETED)),
        incomplete_routes=Count("id", filter=Q(status__in=[Route.Status.DRAFT, Route.Status.ACTIVE])),
        overdue_routes=Count(
            "id",
            filter=Q(status__in=[Route.Status.DRAFT, Route.Status.ACTIVE])
            & (Q(due_date__lt=today) | Q(attention_reason=Route.Attention.OVERDUE)),
        ),
    )
    appointment_metrics = Appointment.objects.filter(workspace=workspace).aggregate(
        missed_appointments=Count("id", filter=Q(status=Appointment.Status.MISSED)),
        cancelled_appointments=Count("id", filter=Q(status=Appointment.Status.CANCELLED)),
    )
    task_metrics = Task.objects.filter(workspace=workspace).aggregate(
        open_tasks=Count("id", filter=Q(status=Task.Status.OPEN)),
        due_tasks=Count("id", filter=Q(status=Task.Status.OPEN, due_at__date__lte=today)),
        completed_tasks=Count("id", filter=Q(status=Task.Status.DONE)),
    )
    task_count = task_metrics["due_tasks"]
    calls_today = Task.objects.filter(
        workspace=workspace,
        status=Task.Status.OPEN,
        kind=Task.Kind.CALLBACK,
        due_at__date=today,
    ).count()
    overdue_steps = RouteStep.objects.filter(
        workspace=workspace,
        route__status__in=[Route.Status.DRAFT, Route.Status.ACTIVE],
        status__in=[RouteStep.Status.PENDING, RouteStep.Status.SCHEDULED],
        due_date__lt=today,
    ).count()
    eligible_routes = route_metrics["eligible_routes"]
    analytics = {
        "as_of": today.isoformat(),
        **route_metrics,
        "completion_rate_percent": round(route_metrics["completed_routes"] * 100 / eligible_routes, 1) if eligible_routes else 0,
        **appointment_metrics,
        **task_metrics,
    }
    patients = list(patient_queryset(workspace))
    patient_priorities = [patient_operational_info(patient)["priority"]["category"] for patient in patients]
    priority_counts = {category: patient_priorities.count(category) for category in ("high", "medium", "low")}
    return Response({"summary": {"total": len(routes), "patients": len(patients), "active": len(active), "completed": status_counts.get("completed", 0), "attention": sum(1 for route in active if route.attention_reason), "overdue_steps": overdue_steps, "tasks_due": task_count, "calls_today": calls_today, "priority_counts": priority_counts}, "status_counts": status_counts, "attention_counts": attention_counts, "priority_routes": RouteListSerializer(prioritized, many=True).data, "analytics": analytics})


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def routes_view(request):
    workspace = get_workspace(request)
    if request.method == "POST":
        study = get_object_or_404(Study, pk=request.data.get("study_id"), workspace=workspace)
        if Route.objects.filter(workspace=workspace, study=study, status__in=[Route.Status.DRAFT, Route.Status.ACTIVE]).exists():
            raise DomainError("Для этого исследования уже существует активный маршрут.", code="duplicate_route", status_code=409)
        raise DomainError(
            "Создание маршрута без согласованного плана шагов отключено. Используйте импорт утверждённого плана.",
            code="route_plan_required",
        )
    queryset = route_queryset(workspace)
    for field in ("status", "attention_reason", "assignee"):
        value = request.query_params.get(field)
        if value:
            queryset = queryset.filter(**{field: value})
    search = request.query_params.get("search", "").strip()
    if search:
        queryset = queryset.filter(Q(patient__full_name__icontains=search) | Q(patient__code__icontains=search) | Q(study__uid__icontains=search))
    routes = list(queryset)
    routes.sort(key=lambda route: (-priority_info(route)["score"], route.due_date, route.id))
    return Response(RouteListSerializer(routes, many=True).data)


@api_view(["GET"])
@permission_classes([AllowAny])
def route_detail(request, route_id):
    workspace = get_workspace(request)
    route = get_object_or_404(route_queryset(workspace), pk=route_id)
    return Response(RouteDetailSerializer(route).data)


@api_view(["POST"])
@permission_classes([AllowAny])
def route_confirm(request, route_id):
    workspace = get_workspace(request)
    confirm_route(workspace, route_id, request.user)
    return Response(RouteDetailSerializer(route_queryset(workspace).get(pk=route_id)).data)


@api_view(["POST"])
@permission_classes([AllowAny])
def route_assign(request, route_id):
    workspace = get_workspace(request)
    employee = get_object_or_404(Employee, pk=request.data.get("employee_id"), workspace=workspace)
    assign_route(workspace, route_id, employee, request.user)
    return Response(RouteDetailSerializer(route_queryset(workspace).get(pk=route_id)).data)


@api_view(["POST"])
@permission_classes([AllowAny])
def step_book(request, step_id):
    workspace = get_workspace(request)
    payload = book_slot(workspace, step_id, request.data.get("slot_id"), request.user, request.headers.get("Idempotency-Key", ""))
    return Response(payload, status=201)


@api_view(["POST"])
@permission_classes([AllowAny])
def step_complete(request, step_id):
    workspace = get_workspace(request)
    complete_step(workspace, step_id, request.user)
    return Response({"ok": True})


@api_view(["POST"])
@permission_classes([AllowAny])
def step_document(request, step_id):
    workspace = get_workspace(request)
    document = add_document(
        workspace,
        step_id,
        request.data.get("label", ""),
        request.user,
        kind=request.data.get("kind", Document.Kind.CONFIRMATION),
        uploaded_file=request.FILES.get("file"),
    )
    return Response({"id": document.id, "label": document.label, "download_url": f"/api/documents/{document.id}/content/" if document.content else None}, status=201)


@api_view(["GET"])
@permission_classes([AllowAny])
def document_content(request, document_id):
    workspace = get_workspace(request)
    document = get_object_or_404(Document, pk=document_id, workspace=workspace, synthetic=True)
    if not document.content:
        raise Http404("Document content is not available")
    response = HttpResponse(bytes(document.content), content_type=document.content_type or "application/octet-stream")
    response["Content-Disposition"] = f"inline; filename*=UTF-8''{quote(document.file_name or 'document')}"
    response["X-Content-Type-Options"] = "nosniff"
    response["Cache-Control"] = "private, no-store"
    return response


@api_view(["POST"])
@permission_classes([AllowAny])
def route_comment(request, route_id):
    workspace = get_workspace(request)
    route = get_object_or_404(Route, pk=route_id, workspace=workspace)
    body = request.data.get("body", "").strip()
    if not body:
        raise DomainError("Комментарий не может быть пустым.")
    comment = Comment.objects.create(workspace=workspace, route=route, author=author_name(workspace, request.user), body=body[:500])
    audit(workspace, route, "comment_added", "Добавлен комментарий", comment.author)
    return Response({"id": comment.id}, status=201)


@api_view(["POST"])
@permission_classes([AllowAny])
def route_contact(request, route_id):
    workspace = get_workspace(request)
    result = save_contact(
        workspace,
        route_id,
        request.data.get("outcome", ""),
        request.data.get("note", "").strip()[:500],
        request.data.get("callback_at"),
        request.user,
        request.headers.get("Idempotency-Key", ""),
    )
    return Response({"id": result.id}, status=201)


@api_view(["GET"])
@permission_classes([AllowAny])
def schedule(request):
    workspace = get_workspace(request)
    queryset = ScheduleSlot.objects.filter(workspace=workspace).select_related("service", "specialist", "facility")
    for field in ("service", "facility", "specialist", "status"):
        value = request.query_params.get(field)
        if value:
            queryset = queryset.filter(**{field: value})
    after = request.query_params.get("after")
    if after:
        queryset = queryset.filter(starts_at__gte=after)
    if request.query_params.get("available") == "1":
        queryset = queryset.filter(status=ScheduleSlot.Status.FREE, starts_at__gt=workspace.reference_now())
    return Response(SlotSerializer(queryset[:240], many=True).data)


@api_view(["GET"])
@permission_classes([AllowAny])
def employees(request):
    workspace = get_workspace(request)
    return Response(EmployeeSerializer(workspace.employees.filter(active=True), many=True).data)


@api_view(["GET"])
@permission_classes([AllowAny])
def tasks_view(request):
    workspace = get_workspace(request)
    queryset = Task.objects.filter(workspace=workspace).select_related("route__patient", "assignee")
    if request.user.is_authenticated:
        employee = workspace.employees.filter(user=request.user, active=True).first()
        if employee:
            queryset = queryset.filter(assignee=employee)
    status = request.query_params.get("status")
    if status:
        queryset = queryset.filter(status=status)
    return Response(TaskSerializer(queryset, many=True).data)


@api_view(["POST"])
@permission_classes([AllowAny])
def task_complete(request, task_id):
    workspace = get_workspace(request)
    with transaction.atomic():
        task = get_object_or_404(Task.objects.select_for_update(), pk=task_id, workspace=workspace)
        if task.status != Task.Status.DONE:
            task.status = Task.Status.DONE
            task.completed_at = timezone.now()
            task.save(update_fields=["status", "completed_at"])
            audit(workspace, task.route, "task_completed", f"Задача выполнена: {task.title}", author_name(workspace, request.user))
    return Response({"ok": True})


@api_view(["POST"])
@permission_classes([AllowAny])
def appointment_status(request, appointment_id):
    workspace = get_workspace(request)
    target = request.data.get("status")
    if target not in {Appointment.Status.CANCELLED, Appointment.Status.MISSED}:
        raise DomainError("Можно отметить только отмену или неявку.")
    with transaction.atomic():
        appointment = get_object_or_404(Appointment.objects.select_for_update().select_related("step__route", "slot"), pk=appointment_id, workspace=workspace)
        if appointment.status != Appointment.Status.SCHEDULED:
            raise DomainError("Запись уже не активна.", code="appointment_inactive", status_code=409)
        appointment.status = target
        appointment.reason = request.data.get("reason", "").strip()[:240]
        appointment.save(update_fields=["status", "reason", "updated_at"])
        appointment.slot.status = ScheduleSlot.Status.FREE
        appointment.slot.save(update_fields=["status"])
        appointment.step.status = RouteStep.Status.PENDING
        appointment.step.save(update_fields=["status"])
        route = appointment.step.route
        route.status = Route.Status.ACTIVE
        route.attention_reason = Route.Attention.CANCELLED if target == Appointment.Status.CANCELLED else Route.Attention.MISSED
        route.return_reason = appointment.reason or appointment.get_status_display()
        route.save(update_fields=["status", "attention_reason", "return_reason"])
        ensure_follow_up_task(workspace, route, target, route.assignee)
        audit(workspace, route, f"appointment_{target}", f"Запись: {appointment.get_status_display()}", author_name(workspace, request.user))
    return Response({"ok": True})


@api_view(["POST"])
@permission_classes([AllowAny])
def demo_advance(request):
    workspace = get_workspace(request)
    if workspace.kind != Workspace.Kind.DEMO:
        raise DomainError("Изменять условную дату можно только в деморежиме.", status_code=403)
    days = int(request.data.get("days", 1))
    if not 1 <= days <= 30:
        raise DomainError("Можно перейти вперёд на срок от 1 до 30 дней.")
    workspace.demo_date += timedelta(days=days)
    workspace.save(update_fields=["demo_date"])
    audit(workspace, None, "demo_advanced", f"Условная дата сдвинута на {days} дн.", "Гость деморежима")
    return Response(session_payload(request, workspace))


@api_view(["POST"])
@permission_classes([AllowAny])
def demo_reset(request):
    workspace = get_workspace(request)
    if workspace.kind != Workspace.Kind.DEMO:
        raise DomainError("Сброс доступен только в деморежиме.", status_code=403)
    workspace.delete()
    fresh = create_demo_workspace()
    request.session["routeguard_workspace_id"] = str(fresh.id)
    return Response(session_payload(request, fresh))
