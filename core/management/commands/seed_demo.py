from django.core.management.base import BaseCommand

from core.demo import create_demo_workspace


class Command(BaseCommand):
    help = "Create a disposable RouteGuard demo workspace with scenarios P001-P020."

    def handle(self, *args, **options):
        workspace = create_demo_workspace()
        self.stdout.write(self.style.SUCCESS(f"Created demo workspace {workspace.id} with 20 scenarios"))
