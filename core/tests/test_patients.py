from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from core.demo import create_demo_workspace
from core.models import Document, Patient, Route


class PatientRegistryTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.workspace = create_demo_workspace()
        cls.other_workspace = create_demo_workspace()

    def client_for(self, workspace=None):
        client = APIClient()
        session = client.session
        session["routeguard_workspace_id"] = str((workspace or self.workspace).id)
        session.save()
        return client

    def test_registry_has_one_row_per_patient_and_searches_name_or_code(self):
        client = self.client_for()
        response = client.get("/api/patients/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 20)
        self.assertEqual(len({item["id"] for item in response.data}), 20)
        self.assertEqual(len(client.get("/api/patients/?search=P013").data), 1)
        self.assertEqual(len(client.get("/api/patients/?search=Жукова").data), 1)

    def test_registration_generates_code_and_rejects_duplicate_identity(self):
        client = self.client_for()
        response = client.post(
            "/api/patients/",
            {"full_name": "  Алиса   Сергеевна   Тестова ", "birth_date": "1990-03-14"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["code"], "P021")
        self.assertEqual(response.data["full_name"], "Алиса Сергеевна Тестова")
        duplicate = client.post(
            "/api/patients/",
            {"full_name": "алиса сергеевна тестова", "birth_date": "1990-03-14"},
            format="json",
        )
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(Patient.objects.filter(workspace=self.workspace, code="P021").count(), 1)

    def test_patient_card_supports_multiple_routes_and_approved_plan_only(self):
        client = self.client_for()
        patient = Patient.objects.get(workspace=self.workspace, code="P005")
        created = client.post(
            f"/api/patients/{patient.id}/routes/",
            {"plan_id": "follow-up-consultation"},
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(len(created.data["steps"]), 2)
        detail = client.get(f"/api/patients/{patient.id}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(len(detail.data["routes"]), 2)
        duplicate = client.post(
            f"/api/patients/{patient.id}/routes/",
            {"plan_id": "follow-up-consultation"},
            format="json",
        )
        self.assertEqual(duplicate.status_code, 409)
        invalid = client.post(
            f"/api/patients/{patient.id}/routes/",
            {"plan_id": "invented-clinical-plan"},
            format="json",
        )
        self.assertEqual(invalid.status_code, 400)

    def test_synthetic_document_upload_preview_and_workspace_isolation(self):
        client = self.client_for()
        route = Route.objects.get(workspace=self.workspace, patient__code="P013")
        step = route.steps.order_by("sequence").first()
        uploaded = SimpleUploadedFile("synthetic-result.txt", b"Synthetic demo document", content_type="text/plain")
        response = client.post(
            f"/api/steps/{step.id}/documents/",
            {"label": "Синтетический результат", "kind": "result", "file": uploaded},
            format="multipart",
        )
        self.assertEqual(response.status_code, 201)
        document = Document.objects.get(pk=response.data["id"])
        self.assertTrue(document.synthetic)
        preview = client.get(response.data["download_url"])
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.content, b"Synthetic demo document")
        self.assertEqual(preview["Cache-Control"], "private, no-store")
        self.assertEqual(self.client_for(self.other_workspace).get(response.data["download_url"]).status_code, 404)
        disguised = SimpleUploadedFile("unsafe.png", b"not really an image", content_type="image/png")
        rejected = client.post(
            f"/api/steps/{step.id}/documents/",
            {"label": "Неверный файл", "kind": "result", "file": disguised},
            format="multipart",
        )
        self.assertEqual(rejected.status_code, 400)

    def test_patient_endpoints_do_not_leak_other_workspace(self):
        patient = Patient.objects.get(workspace=self.workspace, code="P001")
        other_client = self.client_for(self.other_workspace)
        self.assertEqual(other_client.get(f"/api/patients/{patient.id}/").status_code, 404)
        self.assertEqual(
            other_client.post(
                f"/api/patients/{patient.id}/routes/",
                {"plan_id": "follow-up-consultation"},
                format="json",
            ).status_code,
            404,
        )
