from __future__ import annotations

from datetime import datetime

from django.db import IntegrityError, transaction
from django.utils import timezone

from .exceptions import DomainError
from .models import ActionKey, Appointment, AuditEvent, ContactResult, Document, Route, RouteStep, ScheduleSlot, Task, Workspace


def audit(workspace: Workspace, route: Route | None, event_type: str, message: str, author: str) -> None:
    AuditEvent.objects.create(workspace=workspace, route=route, event_type=event_type, message=message, author=author, demo_date=workspace.demo_date)


def current_employee(workspace, user):
    if not getattr(user, "is_authenticated", False):
        return None
    return workspace.employees.filter(user=user, active=True).first()


def author_name(workspace, user) -> str:
    employee = current_employee(workspace, user)
    if employee:
        return employee.full_name
    if getattr(user, "is_authenticated", False):
        return user.get_full_name() or user.username
    return "Гость деморежима"


def priority_info(route: Route) -> dict:
    today = route.workspace.demo_date if route.workspace.kind == Workspace.Kind.DEMO else timezone.localdate()
    open_task_today = route.tasks.filter(status=Task.Status.OPEN, due_at__date__lte=today).exists()
    if route.status == Route.Status.COMPLETED:
        return {"score": 0, "level": "done", "label": "Завершён", "reason": "Все обязательные шаги выполнены"}
    if route.due_date < today or route.attention_reason == Route.Attention.OVERDUE:
        return {"score": 100, "level": "critical", "label": "Срочно", "reason": "Организационный срок уже истёк"}
    if open_task_today:
        return {"score": 90, "level": "critical", "label": "Сегодня", "reason": "Есть задача со сроком сегодня или раньше"}
    if route.attention_reason in {Route.Attention.MISSED, Route.Attention.CANCELLED}:
        return {"score": 80, "level": "high", "label": "Высокий", "reason": "Нужна повторная запись после отмены или неявки"}
    if route.attention_reason in {Route.Attention.NO_SLOT, Route.Attention.NO_ASSIGNEE, Route.Attention.NO_DOCUMENT}:
        return {"score": 65, "level": "high", "label": "Высокий", "reason": route.get_attention_reason_display()}
    if route.due_date <= today + timezone.timedelta(days=1) or route.attention_reason == Route.Attention.DUE_SOON:
        return {"score": 50, "level": "medium", "label": "Скоро", "reason": "Срок наступает сегодня или завтра"}
    return {"score": 20, "level": "normal", "label": "Планово", "reason": "Маршрут идёт по плану"}


def recalculate_route(route: Route) -> Route:
    """Recalculate only after a write. Never call this from list/detail GET handlers."""
    required = list(route.steps.filter(required=True))
    all_done = bool(required) and all(step.status == RouteStep.Status.COMPLETED for step in required)
    missing_document = any(step.status == RouteStep.Status.COMPLETED and step.confirmation_required and not step.documents.exists() for step in required)
    fields = []
    if all_done and not missing_document:
        if route.status != Route.Status.COMPLETED:
            route.status = Route.Status.COMPLETED
            fields.append("status")
        if route.completed_at is None:
            route.completed_at = timezone.now()
            fields.append("completed_at")
        if route.attention_reason:
            route.attention_reason = ""
            fields.append("attention_reason")
    elif missing_document and route.attention_reason != Route.Attention.NO_DOCUMENT:
        route.attention_reason = Route.Attention.NO_DOCUMENT
        fields.append("attention_reason")
    if fields:
        route.save(update_fields=fields)
    return route


@transaction.atomic
def confirm_route(workspace, route_id, user):
    route = Route.objects.select_for_update().get(pk=route_id, workspace=workspace)
    if route.status != Route.Status.DRAFT:
        raise DomainError("Подтвердить можно только черновик.")
    route.status = Route.Status.ACTIVE
    route.attention_reason = ""
    route.save(update_fields=["status", "attention_reason"])
    audit(workspace, route, "route_confirmed", "Маршрут подтверждён", author_name(workspace, user))
    return route


@transaction.atomic
def assign_route(workspace, route_id, employee, user):
    route = Route.objects.select_for_update().get(pk=route_id, workspace=workspace)
    if employee.workspace_id != workspace.id or not employee.active:
        raise DomainError("Сотрудник недоступен.")
    route.assignee = employee
    if route.attention_reason == Route.Attention.NO_ASSIGNEE:
        route.attention_reason = ""
    route.save(update_fields=["assignee", "attention_reason"])
    audit(workspace, route, "assignee_changed", f"Назначен ответственный: {employee.full_name}", author_name(workspace, user))
    return route


@transaction.atomic
def book_slot(workspace, step_id, slot_id, user, idempotency_key=""):
    if idempotency_key:
        previous = ActionKey.objects.filter(workspace=workspace, action="book_slot", key=idempotency_key).first()
        if previous:
            return previous.response
    step = RouteStep.objects.select_for_update().select_related("route").get(pk=step_id, workspace=workspace)
    slot = ScheduleSlot.objects.select_for_update().get(pk=slot_id, workspace=workspace)
    if step.status == RouteStep.Status.COMPLETED:
        raise DomainError("Выполненный шаг нельзя записать на приём.")
    if slot.service_id != step.service_id:
        raise DomainError("Слот не соответствует услуге шага.")
    if slot.status != ScheduleSlot.Status.FREE:
        raise DomainError("Этот слот уже недоступен.", code="slot_unavailable", status_code=409)
    if slot.starts_at <= workspace.reference_now():
        raise DomainError("Нельзя записать на прошедшее время.")
    existing = Appointment.objects.filter(step=step, status=Appointment.Status.SCHEDULED).first()
    if existing:
        raise DomainError("Для этого шага уже есть активная запись.", code="duplicate_appointment", status_code=409)
    appointment = Appointment.objects.create(workspace=workspace, step=step, slot=slot)
    slot.status = ScheduleSlot.Status.BUSY
    slot.save(update_fields=["status"])
    step.status = RouteStep.Status.SCHEDULED
    step.save(update_fields=["status"])
    route = step.route
    if route.attention_reason in {Route.Attention.NO_SLOT, Route.Attention.CANCELLED, Route.Attention.MISSED, Route.Attention.NO_CONFIRMATION}:
        route.attention_reason = ""
        route.save(update_fields=["attention_reason"])
    audit(workspace, route, "appointment_booked", f"Запись создана на {timezone.localtime(slot.starts_at):%d.%m.%Y %H:%M}", author_name(workspace, user))
    response = {"appointment_id": appointment.id}
    if idempotency_key:
        try:
            ActionKey.objects.create(workspace=workspace, action="book_slot", key=idempotency_key, response=response)
        except IntegrityError:
            return ActionKey.objects.get(workspace=workspace, action="book_slot", key=idempotency_key).response
    return response


@transaction.atomic
def complete_step(workspace, step_id, user):
    step = RouteStep.objects.select_for_update().select_related("route").get(pk=step_id, workspace=workspace)
    if step.status == RouteStep.Status.COMPLETED:
        return step
    appointment = step.appointments.filter(status=Appointment.Status.SCHEDULED).select_related("slot").first()
    if appointment:
        appointment.status = Appointment.Status.COMPLETED
        appointment.save(update_fields=["status", "updated_at"])
    step.status = RouteStep.Status.COMPLETED
    if step.completed_at is None:
        step.completed_at = timezone.now()
    step.save(update_fields=["status", "completed_at"])
    audit(workspace, step.route, "step_completed", f"Шаг выполнен: {step.title}", author_name(workspace, user))
    recalculate_route(step.route)
    return step


@transaction.atomic
def add_document(workspace, step_id, label, user):
    step = RouteStep.objects.select_for_update().select_related("route").get(pk=step_id, workspace=workspace)
    document = Document.objects.create(workspace=workspace, step=step, label=label or "Синтетический демодокумент")
    audit(workspace, step.route, "document_added", f"Добавлен документ: {document.label}", author_name(workspace, user))
    recalculate_route(step.route)
    return document


@transaction.atomic
def save_contact(workspace, route_id, outcome, note, callback_at, user):
    route = Route.objects.select_for_update().get(pk=route_id, workspace=workspace)
    if outcome not in ContactResult.Outcome.values:
        raise DomainError("Выберите корректный результат звонка.")
    callback_dt = None
    if callback_at:
        try:
            callback_dt = datetime.fromisoformat(callback_at.replace("Z", "+00:00"))
            if timezone.is_naive(callback_dt):
                callback_dt = timezone.make_aware(callback_dt)
        except ValueError as exc:
            raise DomainError("Укажите корректную дату повторного звонка.") from exc
    if outcome == ContactResult.Outcome.CALLBACK and callback_dt is None:
        raise DomainError("Для результата «Перезвонить» укажите дату и время.")
    employee = current_employee(workspace, user) or route.assignee
    result = ContactResult.objects.create(workspace=workspace, route=route, employee=employee, outcome=outcome, note=note, callback_at=callback_dt)
    if outcome == ContactResult.Outcome.CALLBACK:
        Task.objects.create(workspace=workspace, route=route, assignee=employee, kind=Task.Kind.CALLBACK, title=f"Перезвонить пациенту {route.patient.full_name}", due_at=callback_dt)
    audit(workspace, route, "contact_saved", f"Результат звонка: {result.get_outcome_display()}", author_name(workspace, user))
    return result
