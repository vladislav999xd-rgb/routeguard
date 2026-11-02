from __future__ import annotations

from .models import Appointment, ContactResult, Route, Task


def build_call_assistant(route: Route) -> dict:
    first_name = " ".join(route.patient.full_name.split()[:2])
    step = route.steps.exclude(status="completed").order_by("sequence").first() or route.steps.order_by("sequence").first()
    appointment = (
        Appointment.objects.filter(step__route=route, status=Appointment.Status.SCHEDULED)
        .select_related("slot__facility")
        .order_by("slot__starts_at")
        .first()
    )
    variants = {
        "cancelled": ("Возврат после отмены", "уточнить готовность выбрать новое время", ["Готовы ли вы выбрать новую дату?", "Какие дни и время удобнее?", "Подойдёт ли другая площадка?"]),
        "missed": ("Повторная запись после неявки", "спокойно уточнить ситуацию и согласовать следующий контакт", ["Хотите подобрать новую дату?", "Нужно ли перезвонить позже?", "Есть ли ограничения по времени?"]),
        "no_slot": ("Согласование альтернативы", "объяснить отсутствие подходящего слота и согласовать альтернативу", ["Можно ли рассмотреть более позднюю дату?", "Подойдёт ли другая площадка?", "Какое время дня удобнее?"]),
        "no_assignee": ("Первичный организационный контакт", "уточнить пожелания и передать их ответственному", ["Когда лучше связаться повторно?", "Есть ли предпочтения по времени посещения?"]),
        "overdue": ("Возврат просроченного шага", "согласовать ближайшее организационное действие", ["Получится ли выбрать время сейчас?", "Нужно ли перезвонить позднее?"]),
        "due_soon": ("Срок шага приближается", "согласовать ближайшее организационное действие", ["Получится ли выбрать время сейчас?", "Нужно ли перезвонить позднее?"]),
        "no_confirmation": ("Согласование времени", "подтвердить готовность продолжить маршрут", ["Готовы ли вы продолжить маршрут?", "Какие дни и время подходят?"]),
    }
    scenario, goal, questions = variants.get(
        route.attention_reason,
        ("Напоминание о записи" if appointment else "Организационный звонок", "подтвердить актуальность записи" if appointment else "уточнить готовность к следующему шагу", ["Удобно ли сейчас говорить?", "Когда лучше выполнить следующий шаг?"]),
    )
    contacts = sorted(route.contacts.all(), key=lambda item: (item.created_at, item.id), reverse=True)
    last_contact = contacts[0] if contacts else None
    open_tasks = sorted(
        (task for task in route.tasks.all() if task.status == Task.Status.OPEN),
        key=lambda task: (task.due_at, task.id),
    )
    next_task = open_tasks[0] if open_tasks else None

    opening = f"Здравствуйте, {first_name}. Меня зовут [имя], я координатор RouteGuard. Удобно ли сейчас говорить?"
    previous_contact_prompts = {
        ContactResult.Outcome.REACHED: "В прошлый раз контакт состоялся; верно ли я понимаю, что договорённости остаются актуальны?",
        ContactResult.Outcome.SLOT_AGREED: "Ранее мы согласовали время; всё ли остаётся в силе?",
        ContactResult.Outcome.CALLBACK: "Мы договаривались связаться повторно; удобно ли продолжить сейчас?",
        ContactResult.Outcome.NO_ANSWER: "Ранее нам не удалось связаться; удобно ли поговорить сейчас?",
        ContactResult.Outcome.DECLINED: "Ранее разговор был неудобен; можно ли сейчас коротко обсудить организационный шаг?",
    }
    if last_contact:
        prompt = previous_contact_prompts[last_contact.outcome]
        questions = [prompt, *questions]
    offer = "Я могу предложить доступные варианты. Запись оформлю только после вашего подтверждения."
    closing = "Спасибо. Я зафиксирую результат разговора и согласованное следующее действие."
    return {
        "scenario": scenario,
        "goal": goal.capitalize() + ".",
        "patient": route.patient.full_name,
        "patient_code": route.patient.code,
        "step": step.title if step else "Следующий организационный шаг",
        "due": (step.due_date if step else route.due_date).isoformat(),
        "appointment": appointment.slot.starts_at.isoformat() if appointment else None,
        "contact_attempts": len(contacts),
        "last_contact": {
            "id": last_contact.id,
            "outcome": last_contact.outcome,
            "outcome_label": last_contact.get_outcome_display(),
            "note": last_contact.note,
            "callback_at": last_contact.callback_at.isoformat() if last_contact.callback_at else None,
            "created_at": last_contact.created_at.isoformat(),
        }
        if last_contact
        else None,
        "next_task": {
            "id": next_task.id,
            "kind": next_task.kind,
            "title": next_task.title,
            "due_at": next_task.due_at.isoformat(),
        }
        if next_task
        else None,
        "opening": opening,
        "questions": questions,
        "offer": offer,
        "closing": closing,
        "full_text": "\n\n".join((opening, offer, closing)),
        "disclaimer": "Помощник касается только организации маршрута и не даёт медицинских рекомендаций.",
    }
