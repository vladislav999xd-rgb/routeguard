from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import Appointment, AuditEvent, Comment, Document, Employee, Facility, Patient, Route, RouteStep, ScheduleSlot, Service, Specialist, Study, Task, Workspace

STANDARD_CONCLUSION = "Синтетическое описание демонстрационного исследования. Решение о следующем организационном шаге заранее задано специалистом."

SCENARIOS = [
    dict(code="P001", name="Анна Сергеевна Лебедева", age=46, status="draft", attention="no_confirmation", assignee="Мария Котова", due=5, step="Согласовать консультацию по результатам", step_status="pending", history="План ожидает подтверждения сотрудником.", comment="Проверить план и подтвердить следующий шаг."),
    dict(code="P002", name="Марина Олеговна Соколова", age=52, status="active", attention="", assignee="Мария Котова", due=7, step="Записать на консультацию по результатам", step_status="pending", history="План подтверждён, подходящий слот найден.", comment="Можно оформить запись на ближайший свободный слот."),
    dict(code="P003", name="Елена Викторовна Морозова", age=61, status="active", attention="", assignee="Ирина Смирнова", due=9, step="Пройти консультацию по результатам", step_status="scheduled", appointment=dict(day=4, status="scheduled"), history="Будущая запись подтверждена.", comment="Маршрут идёт по плану."),
    dict(code="P004", name="Ольга Андреевна Волкова", age=48, status="active", attention="", assignee="Ирина Смирнова", due=2, step="Пройти повторный приём", step_status="scheduled", service=2, appointment=dict(day=0, status="scheduled"), history="Запись назначена на демодату.", comment="После посещения отметить результат."),
    dict(code="P005", name="Наталья Игоревна Орлова", age=57, status="completed", attention="", assignee="Мария Котова", due=-1, step="Консультация по результатам", step_status="completed", appointment=dict(day=-1, status="completed"), history="Обязательный шаг выполнен, маршрут закрыт.", comment="Демонстрационный маршрут завершён."),
    dict(code="P006", name="Татьяна Павловна Белова", age=64, status="active", attention="cancelled", assignee="Мария Котова", due=6, step="Подобрать новое время консультации", step_status="pending", appointment=dict(day=-1, status="cancelled", reason="Пациентка отменила запись"), return_reason="Отмена пациенткой", history="Запись отменена. Маршрут возвращён в работу.", comment="Подобрать новый слот и связаться с пациенткой."),
    dict(code="P007", name="Ирина Алексеевна Крылова", age=43, status="active", attention="missed", assignee="Мария Котова", due=4, step="Организовать повторную запись", step_status="pending", appointment=dict(day=-2, status="missed", reason="Неявка"), return_reason="Неявка", history="Зафиксирована неявка, создана задача координатору.", comment="Уточнить готовность выбрать новое время.", task=True),
    dict(code="P008", name="Светлана Дмитриевна Зайцева", age=55, status="active", attention="no_slot", assignee="Ирина Смирнова", due=1, step="Найти слот до условного срока", step_status="pending", service=1, history="Свободных слотов до выбранной даты нет.", comment="Рассмотреть более позднюю дату или другую площадку."),
    dict(code="P009", name="Людмила Петровна Фомина", age=68, status="active", attention="overdue", assignee="Мария Котова", due=-2, step="Организовать повторный приём", step_status="pending", service=2, history="Условный организационный срок нарушен.", comment="Срок шага истёк два дня назад."),
    dict(code="P010", name="Вера Николаевна Громова", age=59, status="draft", attention="no_confirmation", assignee="Ирина Смирнова", due=8, step="Уточнить исходное заключение", step_status="pending", history="Заключение заполнено не полностью.", comment="Запросить уточнение демоданных.", conclusion="Синтетическое демонстрационное заключение заполнено частично; клинические выводы отсутствуют."),
    dict(code="P011", name="Юлия Романовна Тихонова", age=41, status="active", attention="no_assignee", assignee=None, due=5, step="Назначить ответственного за следующий шаг", step_status="pending", history="Следующий шаг задан без ответственного.", comment="Назначьте ответственного."),
    dict(code="P012", name="Екатерина Денисовна Миронова", age=50, status="active", attention="no_document", assignee="Мария Котова", due=1, step="Подтвердить выполнение демодокументом", step_status="completed", confirm=True, history="Шаг выполнен, подтверждающий демодокумент отсутствует.", comment="Закрытие доступно после добавления синтетической заглушки."),
    dict(code="P013", name="Галина Степановна Жукова", age=72, status="active", attention="", assignee="Ирина Смирнова", due=10, steps=[dict(title="Консультация по результатам", status="completed", service=0, due=-1, document="Синтетический демодокумент"), dict(title="Контрольное исследование", status="pending", service=3, due=10)], history="Первый шаг завершён, второй ожидает записи.", comment="Выбрать время контрольного исследования."),
    dict(code="P014", name="Алёна Максимовна Власова", age=39, status="active", attention="cancelled", assignee="Мария Котова", due=8, step="Перенести консультацию", step_status="scheduled", appointment=dict(day=3, status="scheduled"), history="Получен запрос на перенос записи.", comment="Есть альтернативный свободный слот."),
    dict(code="P015", name="Надежда Валерьевна Кузнецова", age=63, status="active", attention="", assignee="Ирина Смирнова", due=12, step="Пройти консультацию по результатам", step_status="scheduled", appointment=dict(day=5, status="scheduled"), history="Активный маршрут по исследованию уже существует.", comment="Повторное создание должно показать предупреждение о дубле."),
    dict(code="P016", name="Лариса Евгеньевна Попова", age=54, status="active", attention="no_confirmation", assignee="Мария Котова", due=7, step="Согласовать удобное время", step_status="pending", history="Ожидается согласование времени с пациенткой.", comment="После демозвонка можно выбрать слот."),
    dict(code="P017", name="Валентина Аркадьевна Новикова", age=66, status="active", attention="cancelled", assignee="Мария Котова", due=5, step="Подобрать новую запись", step_status="pending", appointment=dict(day=1, status="cancelled", reason="Приём отменён клиникой"), return_reason="Отмена клиникой", history="Клиника отменила приём, требуется перезапись.", comment="Предложить новый слот."),
    dict(code="P018", name="Ксения Ильинична Федорова", age=45, status="active", attention="no_slot", assignee="Ирина Смирнова", due=6, step="Подтвердить альтернативную площадку", step_status="pending", history="Удобная площадка недоступна, найдена альтернатива.", comment="Не менять площадку без подтверждения сотрудника."),
    dict(code="P019", name="Тамара Борисовна Павлова", age=70, status="completed", attention="", assignee="Мария Котова", due=-1, steps=[dict(title="Консультация по результатам", status="completed", service=0, due=-4, document="Синтетический демодокумент"), dict(title="Контрольное исследование", status="completed", service=3, due=-1, document="Синтетический демодокумент")], history="Оба обязательных шага выполнены, маршрут закрыт.", comment="Полная история сохранена."),
    dict(code="P020", name="Дарья Константиновна Романова", age=47, status="active", attention="due_soon", assignee="Мария Котова", due=1, step="Записать на консультацию", step_status="pending", history="Срок следующего шага наступает завтра.", comment="Записи пока нет, требуется внимание.", task=True),
]


def aware_on(day: date, hour: int) -> datetime:
    return timezone.make_aware(datetime.combine(day, time(hour, 0)), ZoneInfo(settings.TIME_ZONE))


@transaction.atomic
def seed_workspace(workspace: Workspace) -> Workspace:
    employees = {name: Employee.objects.create(workspace=workspace, full_name=name) for name in ["Мария Котова", "Ирина Смирнова", "Алексей Воронцов"]}
    services = [Service.objects.create(workspace=workspace, name=name) for name in ["Консультация по результатам", "Дополнительное исследование", "Повторный приём", "Контрольное исследование"]]
    facilities = [Facility.objects.create(workspace=workspace, name=name, address=address) for name, address in [("Центр на Лесной", "ул. Лесная, 14"), ("Клиника на Мира", "пр. Мира, 32"), ("Диагностический центр", "ул. Центральная, 8")]]
    specialists = [Specialist.objects.create(workspace=workspace, full_name=name, service=services[i]) for i, name in enumerate(["Смирнова Ирина Львовна", "Котова Мария Павловна", "Родионов Андрей Сергеевич", "Никитина Ольга Юрьевна"])]
    slots = {}
    for offset in range(-5, 35):
        slot_day = workspace.demo_date + timedelta(days=offset)
        for index, service in enumerate(services):
            slot = ScheduleSlot.objects.create(workspace=workspace, service=service, specialist=specialists[index], facility=facilities[(offset + index) % 3], starts_at=aware_on(slot_day, 9 + index * 2))
            slots[(offset, index)] = slot

    for position, scenario in enumerate(SCENARIOS):
        birthday = date(workspace.demo_date.year - scenario["age"], ((position * 3) % 12) + 1, ((position * 7) % 27) + 1)
        patient = Patient.objects.create(workspace=workspace, code=scenario["code"], full_name=scenario["name"], birth_date=birthday)
        study = Study.objects.create(workspace=workspace, patient=patient, uid=f"DEMO-{scenario['code']}-STUDY", study_type="Демонстрационное исследование", study_date=workspace.demo_date - timedelta(days=14 + position), conclusion=scenario.get("conclusion", STANDARD_CONCLUSION))
        completed_at = aware_on(workspace.demo_date - timedelta(days=1), 16) if scenario["status"] == "completed" else None
        route = Route.objects.create(workspace=workspace, patient=patient, study=study, assignee=employees.get(scenario.get("assignee")), status=scenario["status"], attention_reason=scenario["attention"], due_date=workspace.demo_date + timedelta(days=scenario["due"]), return_reason=scenario.get("return_reason", ""), completed_at=completed_at)
        steps_data = scenario.get("steps") or [dict(title=scenario["step"], status=scenario["step_status"], service=scenario.get("service", 0), due=scenario["due"], confirm=scenario.get("confirm", False))]
        created_steps = []
        for sequence, step_data in enumerate(steps_data, 1):
            step_completed = aware_on(workspace.demo_date + timedelta(days=step_data.get("due", 0)), 15) if step_data["status"] == "completed" else None
            step = RouteStep.objects.create(workspace=workspace, route=route, sequence=sequence, title=step_data["title"], service=services[step_data.get("service", 0)], status=step_data["status"], confirmation_required=step_data.get("confirm", False), due_date=workspace.demo_date + timedelta(days=step_data.get("due", scenario["due"])), completed_at=step_completed)
            created_steps.append(step)
            if step_data.get("document"):
                Document.objects.create(workspace=workspace, step=step, label=step_data["document"])
        if scenario.get("appointment"):
            appointment_data = scenario["appointment"]
            service_index = scenario.get("service", 0)
            slot = slots[(appointment_data["day"], service_index)]
            Appointment.objects.create(workspace=workspace, step=created_steps[0], slot=slot, status=appointment_data["status"], reason=appointment_data.get("reason", ""))
            if appointment_data["status"] == "scheduled":
                slot.status = ScheduleSlot.Status.BUSY
                slot.save(update_fields=["status"])
        Comment.objects.create(workspace=workspace, route=route, author="Демо-сценарий", body=scenario["comment"])
        AuditEvent.objects.create(workspace=workspace, route=route, event_type="scenario_seeded", message=scenario["history"], author="RouteGuard", demo_date=workspace.demo_date)
        if scenario.get("task"):
            Task.objects.create(workspace=workspace, route=route, assignee=route.assignee, kind=Task.Kind.FOLLOW_UP, title=f"Связаться с пациентом {patient.full_name}", due_at=aware_on(workspace.demo_date, 12 + position % 4))
    return workspace


def create_demo_workspace() -> Workspace:
    now = timezone.now()
    workspace = Workspace.objects.create(name=f"Гостевое демо {now:%d.%m.%Y %H:%M}", kind=Workspace.Kind.DEMO, demo_date=timezone.localdate(), expires_at=now + timedelta(hours=settings.ROUTEGUARD_DEMO_TTL_HOURS))
    return seed_workspace(workspace)
