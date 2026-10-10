from __future__ import annotations

import os
import secrets
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from core.demo import seed_workspace
from core.models import Membership, Workspace


class Command(BaseCommand):
    help = "Create the first persistent workspace and random owner credentials if needed."

    @transaction.atomic
    def handle(self, *args, **options):
        existing = Workspace.objects.filter(kind=Workspace.Kind.PERSISTENT).first()
        credentials_path = Path(settings.BASE_DIR) / "OWNER-CREDENTIALS.txt"
        if existing:
            self.stdout.write(f"Persistent workspace already exists: {existing.name}")
            if credentials_path.exists():
                self.stdout.write(f"Owner credentials: {credentials_path}")
            return

        User = get_user_model()
        username = "routeguard_owner"
        suffix = 1
        while User.objects.filter(username=username).exists():
            suffix += 1
            username = f"routeguard_owner_{suffix}"
        password = secrets.token_urlsafe(24)

        user = User.objects.create_user(username, password=password)
        workspace = Workspace.objects.create(
            name="RouteGuard",
            kind=Workspace.Kind.PERSISTENT,
            demo_date=timezone.localdate(),
        )
        seed_workspace(workspace)
        Membership.objects.create(workspace=workspace, user=user, role=Membership.Role.ADMIN)
        employee = workspace.employees.order_by("id").first()
        if employee:
            employee.user = user
            employee.save(update_fields=["user"])

        credentials_path.write_text(
            "RouteGuard owner credentials\n"
            f"Login: {username}\n"
            f"Password: {password}\n",
            encoding="utf-8",
        )
        os.chmod(credentials_path, 0o600)
        self.stdout.write(self.style.SUCCESS("Persistent workspace and owner created."))
        self.stdout.write(f"Login: {username}")
        self.stdout.write(f"Password: {password}")
        self.stdout.write(f"Credentials saved to: {credentials_path}")
