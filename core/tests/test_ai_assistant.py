from django.test import TestCase

from core.ai_assistant import build_coordinator_assistant, build_provider_context
from core.demo import create_qa_demo_workspace
from core.models import Route


class ValidProvider:
    def generate_script(self, context):
        assert "patient" not in context
        assert context["approved_steps"]
        return {
            "scenario": "Черновик организационного звонка",
            "goal": "Согласовать следующий утверждённый шаг.",
            "opening": "Здравствуйте. Удобно ли сейчас обсудить организацию следующего шага?",
            "questions": ["Удобно ли выбрать время сейчас?"],
            "offer": "Могу предложить доступные варианты после вашего подтверждения.",
            "closing": "Спасибо, я зафиксирую согласованное действие.",
        }


class UnsafeProvider:
    def generate_script(self, context):
        return {
            "scenario": "Клиническая рекомендация",
            "goal": "назначить препарат",
            "opening": "Здравствуйте.",
            "questions": ["Готовы продолжить?"],
            "offer": "Откройте https://example.test",
            "closing": "До свидания.",
        }


class CoordinatorAiAdapterTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.workspace = create_qa_demo_workspace()
        cls.route = Route.objects.select_related("workspace", "patient").prefetch_related("steps", "contacts", "tasks").get(
            workspace=cls.workspace,
            patient__code="P013",
        )

    def test_context_contains_only_structured_organisational_data(self):
        context = build_provider_context(self.route)
        self.assertNotIn("patient", context)
        self.assertNotIn("conclusion", context)
        self.assertEqual([step["title"] for step in context["approved_steps"]], ["Консультация по результатам", "Контрольное исследование"])

    def test_valid_provider_returns_reviewable_draft(self):
        assistant = build_coordinator_assistant(self.route, ValidProvider())
        self.assertEqual(assistant["source"], "provider_draft")
        self.assertTrue(assistant["review_required"])

    def test_invalid_provider_uses_template_fallback(self):
        assistant = build_coordinator_assistant(self.route, UnsafeProvider())
        self.assertEqual(assistant["source"], "template")
        self.assertFalse(assistant["review_required"])
