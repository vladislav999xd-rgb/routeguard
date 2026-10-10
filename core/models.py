from __future__ import annotations

import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone


class Workspace(models.Model):
    class Kind(models.TextChoices):
        PERSISTENT = "persistent", "Постоянное"
        DEMO = "demo", "Гостевое демо"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=160)
    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.PERSISTENT)
    demo_date = models.DateField(default=timezone.localdate)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    def reference_now(self) -> datetime:
        current = timezone.localtime()
        if self.kind == self.Kind.DEMO:
            return timezone.make_aware(datetime.combine(self.demo_date, current.time().replace(tzinfo=None)), ZoneInfo(settings.TIME_ZONE))
        return current

    def __str__(self) -> str:
        return self.name


class Membership(models.Model):
    class Role(models.TextChoices):
        ADMIN = "admin", "Администратор"
        COORDINATOR = "coordinator", "Координатор"

    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="routeguard_memberships")
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.COORDINATOR)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["workspace", "user"], name="uq_workspace_user")]


class Employee(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="employees")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="employee_profiles")
    full_name = models.CharField(max_length=180)
    role = models.CharField(max_length=80, default="Координатор")
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["full_name"]
        constraints = [models.UniqueConstraint(fields=["workspace", "full_name"], name="uq_employee_name_workspace")]

    def __str__(self) -> str:
        return self.full_name


class Patient(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="patients")
    code = models.CharField(max_length=24)
    full_name = models.CharField(max_length=180)
    birth_date = models.DateField()

    class Meta:
        ordering = ["code"]
        constraints = [models.UniqueConstraint(fields=["workspace", "code"], name="uq_patient_code_workspace")]


class Study(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="studies")
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name="studies")
    uid = models.CharField(max_length=100)
    study_type = models.CharField(max_length=120)
    study_date = models.DateField()
    conclusion = models.TextField()

    class Meta:
        constraints = [models.UniqueConstraint(fields=["workspace", "uid"], name="uq_study_uid_workspace")]


class Service(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="services")
    name = models.CharField(max_length=160)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["workspace", "name"], name="uq_service_name_workspace")]


class Facility(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="facilities")
    name = models.CharField(max_length=160)
    address = models.CharField(max_length=240, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["workspace", "name"], name="uq_facility_name_workspace")]


class Specialist(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="specialists")
    full_name = models.CharField(max_length=180)
    service = models.ForeignKey(Service, on_delete=models.PROTECT, related_name="specialists")


class Route(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Черновик"
        ACTIVE = "active", "В работе"
        COMPLETED = "completed", "Завершён"
        CANCELLED = "cancelled", "Отменён"

    class Attention(models.TextChoices):
        NONE = "", "Нет"
        NO_CONFIRMATION = "no_confirmation", "Требуется подтверждение"
        NO_ASSIGNEE = "no_assignee", "Нет ответственного"
        NO_SLOT = "no_slot", "Нет подходящего слота"
        CANCELLED = "cancelled", "Запись отменена"
        MISSED = "missed", "Неявка"
        NO_DOCUMENT = "no_document", "Нет подтверждения"
        DUE_SOON = "due_soon", "Срок приближается"
        OVERDUE = "overdue", "Срок истёк"

    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="routes")
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="routes")
    study = models.ForeignKey(Study, on_delete=models.PROTECT, related_name="routes")
    assignee = models.ForeignKey(Employee, null=True, blank=True, on_delete=models.SET_NULL, related_name="routes")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    attention_reason = models.CharField(max_length=24, choices=Attention.choices, blank=True)
    due_date = models.DateField()
    return_reason = models.CharField(max_length=240, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["due_date", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "study"],
                condition=Q(status__in=["draft", "active"]),
                name="uq_active_route_per_study",
            )
        ]


class RouteStep(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Ожидает"
        SCHEDULED = "scheduled", "Запланирован"
        COMPLETED = "completed", "Выполнен"
        CANCELLED = "cancelled", "Отменён"

    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="steps")
    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name="steps")
    sequence = models.PositiveSmallIntegerField()
    title = models.CharField(max_length=240)
    service = models.ForeignKey(Service, on_delete=models.PROTECT, related_name="steps")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    required = models.BooleanField(default=True)
    confirmation_required = models.BooleanField(default=False)
    due_date = models.DateField()
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["sequence"]
        constraints = [models.UniqueConstraint(fields=["route", "sequence"], name="uq_route_step_sequence")]


class ScheduleSlot(models.Model):
    class Status(models.TextChoices):
        FREE = "free", "Свободен"
        BUSY = "busy", "Занят"
        BLOCKED = "blocked", "Недоступен"

    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="slots")
    service = models.ForeignKey(Service, on_delete=models.PROTECT, related_name="slots")
    specialist = models.ForeignKey(Specialist, on_delete=models.PROTECT, related_name="slots")
    facility = models.ForeignKey(Facility, on_delete=models.PROTECT, related_name="slots")
    starts_at = models.DateTimeField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.FREE)

    class Meta:
        ordering = ["starts_at"]
        constraints = [models.UniqueConstraint(fields=["workspace", "specialist", "starts_at"], name="uq_specialist_slot_time")]


class Appointment(models.Model):
    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Запланирована"
        COMPLETED = "completed", "Выполнена"
        CANCELLED = "cancelled", "Отменена"
        MISSED = "missed", "Неявка"

    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="appointments")
    step = models.ForeignKey(RouteStep, on_delete=models.CASCADE, related_name="appointments")
    slot = models.ForeignKey(ScheduleSlot, on_delete=models.PROTECT, related_name="appointments")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.SCHEDULED)
    reason = models.CharField(max_length=240, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["step"], condition=Q(status="scheduled"), name="uq_scheduled_appointment_step"),
            models.UniqueConstraint(fields=["slot"], condition=Q(status="scheduled"), name="uq_scheduled_appointment_slot"),
        ]


class Task(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "Открыта"
        DONE = "done", "Выполнена"
        CANCELLED = "cancelled", "Отменена"

    class Kind(models.TextChoices):
        CALLBACK = "callback", "Повторный звонок"
        FOLLOW_UP = "follow_up", "Следующее действие"
        REVIEW = "review", "Проверка"

    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="tasks")
    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name="tasks")
    assignee = models.ForeignKey(Employee, null=True, blank=True, on_delete=models.SET_NULL, related_name="tasks")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    title = models.CharField(max_length=240)
    due_at = models.DateTimeField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["due_at", "id"]


class ContactResult(models.Model):
    class Outcome(models.TextChoices):
        REACHED = "reached", "Контакт установлен"
        SLOT_AGREED = "slot_agreed", "Время согласовано"
        CALLBACK = "callback", "Нужно перезвонить"
        NO_ANSWER = "no_answer", "Нет ответа"
        DECLINED = "declined", "Отказ от разговора"

    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="contacts")
    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name="contacts")
    employee = models.ForeignKey(Employee, null=True, blank=True, on_delete=models.SET_NULL, related_name="contacts")
    outcome = models.CharField(max_length=20, choices=Outcome.choices)
    note = models.CharField(max_length=500, blank=True)
    callback_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class Document(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="documents")
    step = models.ForeignKey(RouteStep, on_delete=models.CASCADE, related_name="documents")
    label = models.CharField(max_length=240)
    synthetic = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)


class Comment(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="comments")
    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name="comments")
    author = models.CharField(max_length=180)
    body = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)


class AuditEvent(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="events")
    route = models.ForeignKey(Route, null=True, blank=True, on_delete=models.CASCADE, related_name="events")
    event_type = models.CharField(max_length=40)
    message = models.CharField(max_length=500)
    author = models.CharField(max_length=180)
    occurred_at = models.DateTimeField(auto_now_add=True)
    demo_date = models.DateField()

    class Meta:
        ordering = ["-occurred_at", "-id"]


class ActionKey(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="action_keys")
    action = models.CharField(max_length=60)
    key = models.CharField(max_length=100)
    response = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["workspace", "action", "key"], name="uq_action_idempotency")]
