from django.core.management.base import BaseCommand

from core.demo import create_demo_workspace


class Command(BaseCommand):
    help = "Create a disposable RouteGuard demo workspace. Use --full for scenarios P001-P020."

    def add_arguments(self, parser):
        parser.add_argument("--full", action="store_true", help="Seed the complete developer/QA scenario set.")

    def handle(self, *args, **options):
        workspace = create_demo_workspace(full_scenarios=options["full"])
        scenario_count = workspace.patients.count()
        profile = "QA" if options["full"] else "public"
        self.stdout.write(self.style.SUCCESS(f"Created {profile} demo workspace {workspace.id} with {scenario_count} scenarios"))
