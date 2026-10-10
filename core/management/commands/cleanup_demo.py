from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import Workspace


class Command(BaseCommand):
    help = "Delete expired guest demo workspaces."

    def handle(self, *args, **options):
        count, _ = Workspace.objects.filter(kind=Workspace.Kind.DEMO, expires_at__lte=timezone.now()).delete()
        self.stdout.write(self.style.SUCCESS(f"Deleted {count} expired demo objects"))
