from django.core.management.base import BaseCommand
from core.workspace import cleanup_expired_demo_workspaces


class Command(BaseCommand):
    help = "Delete expired guest demo workspaces."

    def handle(self, *args, **options):
        count = cleanup_expired_demo_workspaces()
        self.stdout.write(self.style.SUCCESS(f"Deleted {count} expired demo workspaces"))
