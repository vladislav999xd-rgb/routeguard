from datetime import timedelta

from django.db.models import Q
from django.test import TestCase
from rest_framework.test import APIClient

from core.demo import create_demo_workspace
from core.exceptions import DomainError
from core.models import Appointment, ContactResult, Route, RouteStep, ScheduleSlot, Task
from core.services import book_slot, complete_step, save_contact


class RouteGuardRegressionTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.workspace = create_demo_workspace()

    def route(self, code, *, workspace=None):
        return Route.objects.select_related("patient").get(
            workspace=workspace or self.workspace,
            patient__code=code,
        )

    def client_for(self, workspace=None):
        client = APIClient()
        session = client.session
        session["routeguard_workspace_id"] = str((workspace or self.workspace).id)
        session.save()
        return client

    def future_slot(self, step):
        return ScheduleSlot.objects.filter(
            workspace=self.workspace,
            service=step.service,
            status=ScheduleSlot.Status.FREE,
            starts_at__gt=self.workspace.reference_now(),
        ).first()

    def test_p019_has_truthful_multi_event_history_in_api_order(self):
        route = self.route("P019")
        events = list(route.events.all())
        event_types = [event.event_type for event in events]

        self.assertGreater(len(events), 1)
        self.assertEqual(event_types.count("route_created"), 1)
        self.assertEqual(event_types.count("route_confirmed"), 1)
        self.assertEqual(event_types.count("step_added"), route.steps.count())
        self.assertEqual(
            event_types.count("document_added"),
            sum(step.documents.count() for step in route.steps.all()),
        )
        self.assertEqual(
            event_types.count("step_completed"),
            route.steps.filter(status=RouteStep.Status.COMPLETED).count(),
        )
        self.assertEqual(event_types.count("route_completed"), 1)
        self.assertEqual(event_types.count("scenario_state"), 1)

        response = self.client_for().get(f"/api/routes/{route.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [item["id"] for item in response.data["events"]],
            [event.id for event in events],
        )
        ordering_keys = [
            (event.occurred_at, event.id)
            for event in events
        ]
        self.assertEqual(ordering_keys, sorted(ordering_keys, reverse=True))

    def test_draft_route_cannot_be_booked_or_completed(self):
        route = self.route("P001")
        step = route.steps.get()
        slot = self.future_slot(step)

        self.assertEqual(route.status, Route.Status.DRAFT)
        self.assertIsNotNone(slot)
        with self.assertRaises(DomainError):
            book_slot(self.workspace, step.id, slot.id, None)
        with self.assertRaises(DomainError):
            complete_step(self.workspace, step.id, None)

        step.refresh_from_db()
        slot.refresh_from_db()
        self.assertEqual(step.status, RouteStep.Status.PENDING)
        self.assertEqual(slot.status, ScheduleSlot.Status.FREE)
        self.assertFalse(Appointment.objects.filter(step=step).exists())

    def test_later_required_step_cannot_complete_before_previous_step(self):
        route = self.route("P013")
        first, second = list(route.steps.order_by("sequence"))
        first.status = RouteStep.Status.PENDING
        first.completed_at = None
        first.save(update_fields=["status", "completed_at"])

        with self.assertRaises(DomainError):
            complete_step(self.workspace, second.id, None)

        first.refresh_from_db()
        second.refresh_from_db()
        route.refresh_from_db()
        self.assertEqual(first.status, RouteStep.Status.PENDING)
        self.assertEqual(second.status, RouteStep.Status.PENDING)
        self.assertEqual(route.status, Route.Status.ACTIVE)

    def test_p013_rebooking_and_last_required_step_completion_close_route(self):
        route = self.route("P013")
        first, second = list(route.steps.order_by("sequence"))
        missed = second.appointments.get(status=Appointment.Status.MISSED)
        follow_up = route.tasks.get(
            kind=Task.Kind.FOLLOW_UP,
            status=Task.Status.OPEN,
        )

        self.assertEqual(first.status, RouteStep.Status.COMPLETED)
        self.assertEqual(second.status, RouteStep.Status.PENDING)
        self.assertEqual(missed.slot.status, ScheduleSlot.Status.FREE)
        self.assertEqual(route.attention_reason, Route.Attention.MISSED)
        self.assertEqual(
            route.tasks.filter(
                kind=Task.Kind.FOLLOW_UP,
                status=Task.Status.OPEN,
            ).count(),
            1,
        )
        callback_due = self.workspace.reference_now() + timedelta(days=1)
        save_contact(
            self.workspace,
            route.id,
            ContactResult.Outcome.CALLBACK,
            "synthetic callback before continuation",
            callback_due.isoformat(),
            None,
        )
        callback_task = route.tasks.get(
            kind=Task.Kind.CALLBACK,
            status=Task.Status.OPEN,
        )

        slot = self.future_slot(second)
        self.assertIsNotNone(slot)
        book_slot(
            self.workspace,
            second.id,
            slot.id,
            None,
            idempotency_key="p013-rebook",
        )

        route.refresh_from_db()
        second.refresh_from_db()
        follow_up.refresh_from_db()
        self.assertEqual(route.status, Route.Status.ACTIVE)
        self.assertEqual(route.attention_reason, Route.Attention.NONE)
        self.assertEqual(second.status, RouteStep.Status.SCHEDULED)
        self.assertEqual(follow_up.status, Task.Status.DONE)
        self.assertFalse(
            route.tasks.filter(
                kind=Task.Kind.FOLLOW_UP,
                status=Task.Status.OPEN,
            ).exists()
        )

        complete_step(self.workspace, second.id, None)

        route.refresh_from_db()
        second.refresh_from_db()
        callback_task.refresh_from_db()
        self.assertEqual(second.status, RouteStep.Status.COMPLETED)
        self.assertEqual(route.status, Route.Status.COMPLETED)
        self.assertIsNotNone(route.completed_at)
        self.assertEqual(callback_task.status, Task.Status.DONE)
        self.assertIsNotNone(callback_task.completed_at)
        self.assertFalse(route.tasks.filter(status=Task.Status.OPEN).exists())
        self.assertEqual(route.events.filter(event_type="route_completed").count(), 1)
        self.assertEqual(
            second.appointments.get(status=Appointment.Status.COMPLETED).slot_id,
            slot.id,
        )

    def test_cancelled_and_missed_appointments_release_slot_and_close_one_follow_up_after_rebooking(self):
        client = self.client_for()
        cases = (
            ("P014", Appointment.Status.CANCELLED),
            ("P015", Appointment.Status.MISSED),
        )

        for code, target_status in cases:
            with self.subTest(code=code, target_status=target_status):
                route = self.route(code)
                step = route.steps.get()
                appointment = step.appointments.get(status=Appointment.Status.SCHEDULED)
                old_slot = appointment.slot

                response = client.post(
                    f"/api/appointments/{appointment.id}/status/",
                    {"status": target_status, "reason": f"synthetic {target_status}"},
                    format="json",
                )

                self.assertEqual(response.status_code, 200)
                appointment.refresh_from_db()
                old_slot.refresh_from_db()
                step.refresh_from_db()
                self.assertEqual(appointment.status, target_status)
                self.assertEqual(old_slot.status, ScheduleSlot.Status.FREE)
                self.assertEqual(step.status, RouteStep.Status.PENDING)
                open_follow_ups = Task.objects.filter(
                    route=route,
                    kind=Task.Kind.FOLLOW_UP,
                    status=Task.Status.OPEN,
                )
                self.assertEqual(open_follow_ups.count(), 1)
                follow_up = open_follow_ups.get()

                new_slot = self.future_slot(step)
                self.assertIsNotNone(new_slot)
                first = book_slot(
                    self.workspace,
                    step.id,
                    new_slot.id,
                    None,
                    idempotency_key=f"rebook-{code}",
                )
                second = book_slot(
                    self.workspace,
                    step.id,
                    new_slot.id,
                    None,
                    idempotency_key=f"rebook-{code}",
                )

                self.assertEqual(first, second)
                self.assertEqual(
                    Appointment.objects.filter(
                        step=step,
                        status=Appointment.Status.SCHEDULED,
                    ).count(),
                    1,
                )
                self.assertFalse(
                    Task.objects.filter(
                        route=route,
                        kind=Task.Kind.FOLLOW_UP,
                        status=Task.Status.OPEN,
                    ).exists()
                )
                follow_up.refresh_from_db()
                self.assertEqual(follow_up.status, Task.Status.DONE)
                self.assertIsNotNone(follow_up.completed_at)

    def test_callback_rejects_past_and_updates_single_open_task(self):
        route = self.route("P016")
        past = self.workspace.reference_now() - timedelta(minutes=1)

        with self.assertRaises(DomainError):
            save_contact(
                self.workspace,
                route.id,
                ContactResult.Outcome.CALLBACK,
                "synthetic past callback",
                past.isoformat(),
                None,
            )
        self.assertFalse(route.contacts.exists())
        self.assertFalse(
            route.tasks.filter(kind=Task.Kind.CALLBACK, status=Task.Status.OPEN).exists()
        )

        first_due = self.workspace.reference_now() + timedelta(hours=2)
        second_due = first_due + timedelta(days=1)
        save_contact(
            self.workspace,
            route.id,
            ContactResult.Outcome.CALLBACK,
            "synthetic first callback",
            first_due.isoformat(),
            None,
        )
        first_task = route.tasks.get(
            kind=Task.Kind.CALLBACK,
            status=Task.Status.OPEN,
        )
        save_contact(
            self.workspace,
            route.id,
            ContactResult.Outcome.CALLBACK,
            "synthetic updated callback",
            second_due.isoformat(),
            None,
        )

        open_callbacks = route.tasks.filter(
            kind=Task.Kind.CALLBACK,
            status=Task.Status.OPEN,
        )
        self.assertEqual(open_callbacks.count(), 1)
        updated_task = open_callbacks.get()
        self.assertEqual(updated_task.id, first_task.id)
        self.assertEqual(
            updated_task.due_at.replace(microsecond=0),
            second_due.replace(microsecond=0),
        )

    def test_contacts_and_call_assistant_include_contact_context(self):
        route = self.route("P016")
        first = save_contact(
            self.workspace,
            route.id,
            ContactResult.Outcome.REACHED,
            "synthetic first contact",
            None,
            None,
        )
        callback_due = self.workspace.reference_now() + timedelta(days=1)
        latest = save_contact(
            self.workspace,
            route.id,
            ContactResult.Outcome.CALLBACK,
            "synthetic latest contact",
            callback_due.isoformat(),
            None,
        )
        callback_task = route.tasks.get(
            kind=Task.Kind.CALLBACK,
            status=Task.Status.OPEN,
        )

        response = self.client_for().get(f"/api/routes/{route.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [item["id"] for item in response.data["contacts"]],
            [latest.id, first.id],
        )
        self.assertEqual(
            response.data["contacts"][0]["note"],
            "synthetic latest contact",
        )
        assistant = response.data["call_assistant"]
        self.assertEqual(assistant["contact_attempts"], 2)
        self.assertEqual(assistant["last_contact"]["id"], latest.id)
        self.assertEqual(
            assistant["last_contact"]["note"],
            "synthetic latest contact",
        )
        self.assertEqual(assistant["next_task"]["id"], callback_task.id)
        self.assertEqual(assistant["next_task"]["kind"], Task.Kind.CALLBACK)

    def test_contact_api_idempotency_returns_same_result_without_duplicate_audit(self):
        route = self.route("P016")
        client = self.client_for()
        before_events = route.events.filter(event_type="contact_saved").count()
        payload = {
            "outcome": ContactResult.Outcome.REACHED,
            "note": "synthetic idempotent contact",
        }

        first = client.post(
            f"/api/routes/{route.id}/contact/",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY="stable-contact-key",
        )
        second = client.post(
            f"/api/routes/{route.id}/contact/",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY="stable-contact-key",
        )

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(first.data["id"], second.data["id"])
        self.assertEqual(route.contacts.count(), 1)
        self.assertEqual(
            route.events.filter(event_type="contact_saved").count(),
            before_events + 1,
        )

    def test_route_api_rejects_creation_without_step_plan(self):
        completed_route = self.route("P019")
        study = completed_route.study
        before_route_ids = list(
            Route.objects.filter(workspace=self.workspace, study=study).values_list(
                "id", flat=True
            )
        )

        response = self.client_for().post(
            "/api/routes/",
            {"study_id": study.id},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["code"], "route_plan_required")
        self.assertEqual(
            list(
                Route.objects.filter(
                    workspace=self.workspace,
                    study=study,
                ).values_list("id", flat=True)
            ),
            before_route_ids,
        )

    def test_foreign_workspace_appointment_mutation_is_rejected_without_changes(self):
        foreign_workspace = create_demo_workspace()
        foreign_route = self.route("P014", workspace=foreign_workspace)
        foreign_step = foreign_route.steps.get()
        appointment = foreign_step.appointments.get(status=Appointment.Status.SCHEDULED)
        slot = appointment.slot
        before_events = foreign_route.events.count()
        before_tasks = foreign_route.tasks.count()

        response = self.client_for().post(
            f"/api/appointments/{appointment.id}/status/",
            {"status": Appointment.Status.CANCELLED, "reason": "cross-workspace"},
            format="json",
        )

        self.assertEqual(response.status_code, 404)
        appointment.refresh_from_db()
        slot.refresh_from_db()
        foreign_step.refresh_from_db()
        foreign_route.refresh_from_db()
        self.assertEqual(appointment.status, Appointment.Status.SCHEDULED)
        self.assertEqual(slot.status, ScheduleSlot.Status.BUSY)
        self.assertEqual(foreign_step.status, RouteStep.Status.SCHEDULED)
        self.assertEqual(foreign_route.events.count(), before_events)
        self.assertEqual(foreign_route.tasks.count(), before_tasks)

    def test_dashboard_analytics_formulas_and_workspace_isolation(self):
        today = self.workspace.demo_date
        double_overdue = self.route("P002")
        double_overdue.due_date = today - timedelta(days=1)
        double_overdue.attention_reason = Route.Attention.OVERDUE
        double_overdue.save(update_fields=["due_date", "attention_reason"])

        cancelled_route = self.route("P001")
        cancelled_route.status = Route.Status.CANCELLED
        cancelled_route.save(update_fields=["status"])

        task_route = self.route("P016")
        Task.objects.create(
            workspace=self.workspace,
            route=task_route,
            kind=Task.Kind.REVIEW,
            title="synthetic due task",
            due_at=self.workspace.reference_now() - timedelta(hours=1),
        )
        Task.objects.create(
            workspace=self.workspace,
            route=task_route,
            kind=Task.Kind.REVIEW,
            title="synthetic future task",
            due_at=self.workspace.reference_now() + timedelta(days=2),
        )
        Task.objects.create(
            workspace=self.workspace,
            route=task_route,
            kind=Task.Kind.REVIEW,
            title="synthetic completed task",
            due_at=self.workspace.reference_now() - timedelta(days=1),
            status=Task.Status.DONE,
            completed_at=self.workspace.reference_now(),
        )

        response = self.client_for().get("/api/dashboard/")

        self.assertEqual(response.status_code, 200)
        analytics = response.data["analytics"]
        eligible = Route.objects.filter(workspace=self.workspace).exclude(
            status=Route.Status.CANCELLED
        ).count()
        completed = Route.objects.filter(
            workspace=self.workspace,
            status=Route.Status.COMPLETED,
        ).count()
        incomplete = Route.objects.filter(
            workspace=self.workspace,
            status__in=[Route.Status.DRAFT, Route.Status.ACTIVE],
        ).count()
        overdue = Route.objects.filter(
            workspace=self.workspace,
            status__in=[Route.Status.DRAFT, Route.Status.ACTIVE],
        ).filter(
            Q(due_date__lt=today) | Q(attention_reason=Route.Attention.OVERDUE)
        ).count()
        missed = Appointment.objects.filter(
            workspace=self.workspace,
            status=Appointment.Status.MISSED,
        ).count()
        cancelled = Appointment.objects.filter(
            workspace=self.workspace,
            status=Appointment.Status.CANCELLED,
        ).count()
        open_tasks = Task.objects.filter(
            workspace=self.workspace,
            status=Task.Status.OPEN,
        ).count()
        due_tasks = Task.objects.filter(
            workspace=self.workspace,
            status=Task.Status.OPEN,
            due_at__date__lte=today,
        ).count()
        completed_tasks = Task.objects.filter(
            workspace=self.workspace,
            status=Task.Status.DONE,
        ).count()

        self.assertEqual(analytics["as_of"], today.isoformat())
        self.assertEqual(analytics["eligible_routes"], eligible)
        self.assertEqual(analytics["completed_routes"], completed)
        self.assertEqual(analytics["incomplete_routes"], incomplete)
        self.assertEqual(analytics["completion_rate_percent"], round(completed * 100 / eligible, 1))
        self.assertEqual(analytics["overdue_routes"], overdue)
        self.assertEqual(analytics["missed_appointments"], missed)
        self.assertEqual(analytics["cancelled_appointments"], cancelled)
        self.assertEqual(analytics["open_tasks"], open_tasks)
        self.assertEqual(analytics["due_tasks"], due_tasks)
        self.assertEqual(analytics["completed_tasks"], completed_tasks)
        self.assertEqual(response.data["summary"]["tasks_due"], due_tasks)

        self.assertTrue(double_overdue.due_date < today)
        self.assertEqual(double_overdue.attention_reason, Route.Attention.OVERDUE)
        overdue_ids = set(
            Route.objects.filter(
                workspace=self.workspace,
                status__in=[Route.Status.DRAFT, Route.Status.ACTIVE],
            )
            .filter(Q(due_date__lt=today) | Q(attention_reason=Route.Attention.OVERDUE))
            .values_list("id", flat=True)
        )
        self.assertIn(double_overdue.id, overdue_ids)
        self.assertEqual(analytics["overdue_routes"], len(overdue_ids))

        foreign_workspace = create_demo_workspace()
        foreign_route = self.route("P016", workspace=foreign_workspace)
        Task.objects.create(
            workspace=foreign_workspace,
            route=foreign_route,
            kind=Task.Kind.REVIEW,
            title="foreign task must not leak",
            due_at=foreign_workspace.reference_now(),
        )
        after_foreign_data = self.client_for().get("/api/dashboard/")

        self.assertEqual(after_foreign_data.status_code, 200)
        self.assertEqual(after_foreign_data.data["analytics"], analytics)
