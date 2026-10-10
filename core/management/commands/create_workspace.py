from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from core.demo import seed_workspace
from core.models import Membership, Workspace


class Command(BaseCommand):
    help = "Create a persistent workspace and its administrator."

    def add_arguments(self, parser):
        parser.add_argument("--name", required=True)
        parser.add_argument("--username", required=True)
        parser.add_argument("--password", required=True)

    @transaction.atomic
    def handle(self, *args, **options):
        User = get_user_model()
        if User.objects.filter(username=options["username"]).exists():
            raise CommandError("A user with this username already exists")
        user = User.objects.create_user(options["username"], password=options["password"])
        workspace = Workspace.objects.create(name=options["name"], kind=Workspace.Kind.PERSISTENT, demo_date=timezone.localdate())
        seed_workspace(workspace)
        Membership.objects.create(workspace=workspace, user=user, role=Membership.Role.ADMIN)
        employee = workspace.employees.order_by("id").first()
        employee.user = user
        employee.save(update_fields=["user"])
        self.stdout.write(self.style.SUCCESS(f"Created workspace {workspace.id} and administrator {user.username}"))
