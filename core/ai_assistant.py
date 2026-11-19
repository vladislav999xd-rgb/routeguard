from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Mapping, Protocol

from .call_assistant import build_call_assistant
from .models import Appointment, Route, Workspace


class CoordinatorScriptProvider(Protocol):
    """Provider boundary. Implementations must return data, never mutate RouteGuard."""

    def generate_script(self, context: Mapping[str, Any]) -> Mapping[str, Any]: ...


@dataclass(frozen=True)
class ApprovedStepContext:
    title: str
    status: str
    due_date: str
    confirmation_required: bool


@dataclass(frozen=True)
class CoordinatorScriptContext:
    route_status: str
    attention_reason: str
    approved_steps: tuple[ApprovedStepContext, ...]
    scheduled: bool
    last_contact_outcome: str | None


class ScriptValidationError(ValueError):
    pass


REQUIRED_TEXT_FIELDS = ("scenario", "goal", "opening", "offer", "closing")
PROHIBITED_CLINICAL_MARKERS = (
    "поставить диагноз",
    "назначить препарат",
    "изменить лечение",
    "дозировка",
    "отменить лечение",
)
PROHIBITED_FORMAT_MARKERS = ("http://", "https://", "<", ">")


def build_provider_context(route: Route) -> dict[str, Any]:
    steps = tuple(
        ApprovedStepContext(
            title=step.title,
            status=step.status,
            due_date=step.due_date.isoformat(),
            confirmation_required=step.confirmation_required,
        )
        for step in route.steps.order_by("sequence", "id")
    )
    scheduled = Appointment.objects.filter(step__route=route, status=Appointment.Status.SCHEDULED).exists()
    last_contact = route.contacts.order_by("-created_at", "-id").first()
    context = CoordinatorScriptContext(
        route_status=route.status,
        attention_reason=route.attention_reason,
        approved_steps=steps,
        scheduled=scheduled,
        last_contact_outcome=last_contact.outcome if last_contact else None,
    )
    payload = asdict(context)
    payload["approved_steps"] = [asdict(step) for step in steps]
    return payload


def validate_provider_draft(payload: Mapping[str, Any]) -> dict[str, Any]:
    allowed_keys = {*REQUIRED_TEXT_FIELDS, "questions"}
    if set(payload) != allowed_keys:
        raise ScriptValidationError("Unexpected provider response fields.")
    cleaned: dict[str, Any] = {}
    for field in REQUIRED_TEXT_FIELDS:
        value = payload.get(field)
        if not isinstance(value, str) or not value.strip() or len(value.strip()) > 600:
            raise ScriptValidationError(f"Invalid field: {field}.")
        cleaned[field] = value.strip()
    questions = payload.get("questions")
    if not isinstance(questions, list) or not 1 <= len(questions) <= 5:
        raise ScriptValidationError("Questions must contain from one to five items.")
    if any(not isinstance(item, str) or not item.strip() or len(item.strip()) > 240 for item in questions):
        raise ScriptValidationError("Invalid question item.")
    cleaned["questions"] = [item.strip() for item in questions]
    combined = " ".join([*(cleaned[field] for field in REQUIRED_TEXT_FIELDS), *cleaned["questions"]]).casefold()
    if any(marker in combined for marker in PROHIBITED_CLINICAL_MARKERS):
        raise ScriptValidationError("Clinical recommendations are not allowed.")
    if any(marker in combined for marker in PROHIBITED_FORMAT_MARKERS):
        raise ScriptValidationError("Links and markup are not allowed.")
    return cleaned


def build_coordinator_assistant(route: Route, provider: CoordinatorScriptProvider | None = None) -> dict[str, Any]:
    fallback = build_call_assistant(route)
    fallback.update({"source": "template", "review_required": False})
    if provider is None or route.workspace.kind != Workspace.Kind.DEMO:
        return fallback
    try:
        draft = validate_provider_draft(provider.generate_script(build_provider_context(route)))
    except Exception:
        return fallback
    return {
        **fallback,
        **draft,
        "full_text": "\n\n".join((draft["opening"], draft["offer"], draft["closing"])),
        "source": "provider_draft",
        "review_required": True,
        "disclaimer": "Черновик касается только организации маршрута. Сотрудник обязан проверить его перед использованием.",
    }
