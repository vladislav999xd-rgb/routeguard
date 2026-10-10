from datetime import timedelta
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory

from django.db import IntegrityError, transaction
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from core.demo import create_demo_workspace
from core.exceptions import DomainError
from core.models import Appointment, Route, RouteStep, ScheduleSlot, Task, Workspace
from core.services import add_document, book_slot, complete_step, save_contact


class RouteGuardWorkflowTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.workspace = create_demo_workspace()

    def route(self, code):
        return Route.objects.select_related("patient").get(workspace=self.workspace, patient__code=code)

    def test_all_twenty_scenarios_exist(self):
        self.assertEqual(self.workspace.routes.count(), 20)
        self.assertEqual(list(self.workspace.patients.values_list("code", flat=True)), [f"P{i:03}" for i in range(1, 21)])

    def test_completed_at_is_stable(self):
        route = self.route("P005")
        original = route.completed_at
        step = route.steps.get()
        complete_step(self.workspace, step.id, None)
        route.refresh_from_db()
        self.assertEqual(route.completed_at, original)

    def test_document_closes_confirmation_route(self):
        route = self.route("P012")
        step = route.steps.get()
        add_document(self.workspace, step.id, "Подтверждение", None)
        route.refresh_from_db()
        self.assertEqual(route.status, Route.Status.COMPLETED)
        self.assertIsNotNone(route.completed_at)

    def test_callback_creates_real_task(self):
        route = self.route("P016")
        due = timezone.now() + timedelta(hours=3)
        save_contact(self.workspace, route.id, "callback", "Позвонить после работы", due.isoformat(), None)
        task = Task.objects.get(route=route, kind=Task.Kind.CALLBACK)
        self.assertEqual(task.status, Task.Status.OPEN)
        self.assertEqual(task.due_at.replace(microsecond=0), due.replace(microsecond=0))

    def test_callback_requires_date(self):
        with self.assertRaises(DomainError):
            save_contact(self.workspace, self.route("P016").id, "callback", "", None, None)

    def test_past_slot_is_rejected(self):
        route = self.route("P002")
        step = route.steps.get()
        slot = ScheduleSlot.objects.filter(workspace=self.workspace, service=step.service, starts_at__lt=self.workspace.reference_now()).first()
        with self.assertRaises(DomainError):
            book_slot(self.workspace, step.id, slot.id, None)

    def test_booking_is_idempotent(self):
        route = self.route("P002")
        step = route.steps.get()
        slot = ScheduleSlot.objects.filter(workspace=self.workspace, service=step.service, status="free", starts_at__gt=self.workspace.reference_now()).first()
        first = book_slot(self.workspace, step.id, slot.id, None, "stable-key")
        second = book_slot(self.workspace, step.id, slot.id, None, "stable-key")
        self.assertEqual(first, second)
        self.assertEqual(Appointment.objects.filter(step=step, status="scheduled").count(), 1)

    def test_database_prevents_active_duplicate_for_any_study(self):
        route = self.route("P003")
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Route.objects.create(workspace=self.workspace, patient=route.patient, study=route.study, due_date=route.due_date, status="draft")

    def test_get_does_not_write(self):
        client = APIClient()
        session = client.session
        session["routeguard_workspace_id"] = str(self.workspace.id)
        session.save()
        before = self.workspace.events.count()
        response = client.get("/api/routes/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.workspace.events.count(), before)

    def test_dashboard_counts_callback_tasks_due_today(self):
        client = APIClient()
        session = client.session
        session["routeguard_workspace_id"] = str(self.workspace.id)
        session.save()
        before = client.get("/api/dashboard/").data["summary"]["calls_today"]
        Task.objects.create(
            workspace=self.workspace,
            route=self.route("P016"),
            kind=Task.Kind.CALLBACK,
            title="Контрольный звонок сегодня",
            due_at=self.workspace.reference_now(),
        )
        after = client.get("/api/dashboard/").data["summary"]["calls_today"]
        self.assertEqual(after, before + 1)

    def test_deployment_bootstrap_is_idempotent(self):
        with TemporaryDirectory() as temporary:
            with override_settings(BASE_DIR=temporary):
                output = StringIO()
                call_command("bootstrap_deployment", stdout=output)
                call_command("bootstrap_deployment", stdout=output)
                self.assertEqual(Workspace.objects.filter(kind=Workspace.Kind.PERSISTENT).count(), 1)
                credentials = Path(temporary) / "OWNER-CREDENTIALS.txt"
                self.assertTrue(credentials.exists())
                self.assertIn("Login: routeguard_owner", credentials.read_text(encoding="utf-8"))

    def test_demo_workspaces_are_isolated(self):
        other = create_demo_workspace()
        route = self.route("P001")
        route.status = Route.Status.ACTIVE
        route.save(update_fields=["status"])
        self.assertEqual(other.routes.get(patient__code="P001").status, Route.Status.DRAFT)

    def test_opening_demo_cleans_expired_workspaces(self):
        expired = create_demo_workspace()
        expired.expires_at = timezone.now() - timedelta(minutes=1)
        expired.save(update_fields=["expires_at"])
        client = APIClient()
        response = client.post("/api/demo/open/")
        self.assertEqual(response.status_code, 201)
        self.assertFalse(Workspace.objects.filter(pk=expired.pk).exists())

    def test_scheduled_slot_has_single_owner(self):
        route = self.route("P002")
        step = route.steps.get()
        slot = ScheduleSlot.objects.filter(workspace=self.workspace, service=step.service, status="free", starts_at__gt=self.workspace.reference_now()).first()
        book_slot(self.workspace, step.id, slot.id, None)
        other_step = self.route("P016").steps.get()
        with self.assertRaises(DomainError):
            book_slot(self.workspace, other_step.id, slot.id, None)
