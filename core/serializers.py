from rest_framework import serializers

from .call_assistant import build_call_assistant
from .models import Appointment, AuditEvent, Comment, Document, Employee, Route, RouteStep, ScheduleSlot, Task
from .services import priority_info


class EmployeeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employee
        fields = ["id", "full_name", "role", "active"]


class SlotSerializer(serializers.ModelSerializer):
    service_name = serializers.CharField(source="service.name", read_only=True)
    specialist_name = serializers.CharField(source="specialist.full_name", read_only=True)
    facility_name = serializers.CharField(source="facility.name", read_only=True)
    facility_address = serializers.CharField(source="facility.address", read_only=True)

    class Meta:
        model = ScheduleSlot
        fields = ["id", "starts_at", "status", "service", "service_name", "specialist", "specialist_name", "facility", "facility_name", "facility_address"]


class AppointmentSerializer(serializers.ModelSerializer):
    slot = SlotSerializer(read_only=True)

    class Meta:
        model = Appointment
        fields = ["id", "status", "reason", "slot", "created_at", "updated_at"]


class DocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Document
        fields = ["id", "label", "synthetic", "created_at"]


class StepSerializer(serializers.ModelSerializer):
    service_name = serializers.CharField(source="service.name", read_only=True)
    appointments = AppointmentSerializer(many=True, read_only=True)
    documents = DocumentSerializer(many=True, read_only=True)

    class Meta:
        model = RouteStep
        fields = ["id", "sequence", "title", "service", "service_name", "status", "required", "confirmation_required", "due_date", "completed_at", "appointments", "documents"]


class TaskSerializer(serializers.ModelSerializer):
    patient_code = serializers.CharField(source="route.patient.code", read_only=True)
    patient_name = serializers.CharField(source="route.patient.full_name", read_only=True)
    route_id = serializers.IntegerField(source="route.id", read_only=True)
    assignee_name = serializers.CharField(source="assignee.full_name", read_only=True, allow_null=True)

    class Meta:
        model = Task
        fields = ["id", "route_id", "patient_code", "patient_name", "kind", "title", "due_at", "status", "assignee", "assignee_name", "completed_at"]


class EventSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditEvent
        fields = ["id", "event_type", "message", "author", "occurred_at", "demo_date"]


class CommentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Comment
        fields = ["id", "author", "body", "created_at"]


class RouteListSerializer(serializers.ModelSerializer):
    patient_code = serializers.CharField(source="patient.code", read_only=True)
    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    birth_date = serializers.DateField(source="patient.birth_date", read_only=True)
    study_type = serializers.CharField(source="study.study_type", read_only=True)
    study_uid = serializers.CharField(source="study.uid", read_only=True)
    study_id = serializers.IntegerField(source="study.id", read_only=True)
    assignee_name = serializers.CharField(source="assignee.full_name", read_only=True, allow_null=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    attention_label = serializers.CharField(source="get_attention_reason_display", read_only=True)
    priority = serializers.SerializerMethodField()
    next_step = serializers.SerializerMethodField()

    class Meta:
        model = Route
        fields = ["id", "patient_code", "patient_name", "birth_date", "study_type", "study_uid", "study_id", "assignee", "assignee_name", "status", "status_label", "attention_reason", "attention_label", "due_date", "return_reason", "created_at", "completed_at", "priority", "next_step"]

    def get_priority(self, obj):
        return priority_info(obj)

    def get_next_step(self, obj):
        step = next((item for item in obj.steps.all() if item.status != RouteStep.Status.COMPLETED), None)
        if step is None:
            return None
        return {"id": step.id, "title": step.title, "status": step.status, "due_date": step.due_date, "service_id": step.service_id}


class RouteDetailSerializer(RouteListSerializer):
    conclusion = serializers.CharField(source="study.conclusion", read_only=True)
    study_date = serializers.DateField(source="study.study_date", read_only=True)
    steps = StepSerializer(many=True, read_only=True)
    tasks = TaskSerializer(many=True, read_only=True)
    events = EventSerializer(many=True, read_only=True)
    comments = CommentSerializer(many=True, read_only=True)
    call_assistant = serializers.SerializerMethodField()

    class Meta(RouteListSerializer.Meta):
        fields = RouteListSerializer.Meta.fields + ["conclusion", "study_date", "steps", "tasks", "events", "comments", "call_assistant"]

    def get_call_assistant(self, obj):
        return build_call_assistant(obj)
