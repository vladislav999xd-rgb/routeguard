from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from .exceptions import DomainError
from .models import Membership, Workspace


@transaction.atomic
def delete_demo_workspace(workspace):
    if workspace.kind != Workspace.Kind.DEMO:
        return
    workspace.routes.all().delete()
    workspace.slots.all().delete()
    workspace.specialists.all().delete()
    workspace.delete()


def cleanup_expired_demo_workspaces():
    expired = list(Workspace.objects.filter(kind=Workspace.Kind.DEMO, expires_at__lte=timezone.now()))
    for workspace in expired:
        delete_demo_workspace(workspace)
    return len(expired)


def get_workspace(request, *, required=True):
    workspace = None
    if request.user.is_authenticated:
        membership = Membership.objects.select_related("workspace").filter(user=request.user).first()
        workspace = membership.workspace if membership else None
    if workspace is None:
        workspace_id = request.session.get("routeguard_workspace_id")
        if workspace_id:
            workspace = Workspace.objects.filter(pk=workspace_id, kind=Workspace.Kind.DEMO).first()
            if workspace and workspace.expires_at and workspace.expires_at <= timezone.now():
                delete_demo_workspace(workspace)
                request.session.pop("routeguard_workspace_id", None)
                workspace = None
    if required and workspace is None:
        raise DomainError("Сессия не найдена. Откройте деморежим или войдите.", code="workspace_required", status_code=401)
    return workspace
