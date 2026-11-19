from django.db import migrations, models


def populate_normalized_patient_names(apps, schema_editor):
    Patient = apps.get_model("core", "Patient")
    seen = set()
    for patient in Patient.objects.order_by("workspace_id", "id").iterator():
        full_name = " ".join(patient.full_name.split())
        normalized_name = full_name.casefold()
        suffix_index = 0
        while (patient.workspace_id, normalized_name, patient.birth_date) in seen:
            suffix_index += 1
            suffix = f"#{patient.pk}-{suffix_index}"
            normalized_name = f"{full_name.casefold()[: 180 - len(suffix)]}{suffix}"
        seen.add((patient.workspace_id, normalized_name, patient.birth_date))
        patient.full_name = full_name
        patient.normalized_name = normalized_name
        patient.save(update_fields=["full_name", "normalized_name"])


class Migration(migrations.Migration):
    dependencies = [("core", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="patient",
            name="normalized_name",
            field=models.CharField(default="", editable=False, max_length=180),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="document",
            name="kind",
            field=models.CharField(
                choices=[
                    ("conclusion", "Врачебное заключение"),
                    ("referral", "Направление"),
                    ("result", "Результат исследования"),
                    ("confirmation", "Подтверждение этапа"),
                ],
                default="confirmation",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="document",
            name="file_name",
            field=models.CharField(blank=True, max_length=180),
        ),
        migrations.AddField(
            model_name="document",
            name="content_type",
            field=models.CharField(blank=True, max_length=80),
        ),
        migrations.AddField(
            model_name="document",
            name="content",
            field=models.BinaryField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="document",
            name="size",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.RunPython(populate_normalized_patient_names, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="patient",
            constraint=models.UniqueConstraint(
                fields=("workspace", "normalized_name", "birth_date"),
                name="uq_patient_identity_workspace",
            ),
        ),
    ]
