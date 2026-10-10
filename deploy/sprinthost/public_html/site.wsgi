#!/usr/bin/env python3
import os
import sys
from pathlib import Path

ACCOUNT_ROOT = Path(__file__).resolve().parent.parent
PROJECT_ROOT = ACCOUNT_ROOT / "routeguard_app"
VENV_SITE = PROJECT_ROOT / ".venv" / "lib"

sys.path.insert(0, str(PROJECT_ROOT))
if VENV_SITE.exists():
    versions = sorted(VENV_SITE.glob("python*/site-packages"))
    if versions:
        sys.path.insert(0, str(versions[-1]))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "routeguard.settings")
os.chdir(PROJECT_ROOT)

from django.core.wsgi import get_wsgi_application
application = get_wsgi_application()
