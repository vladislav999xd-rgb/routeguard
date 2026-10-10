from __future__ import annotations

from django.utils import timezone

from .exceptions import DomainError
from .models import Membership, Workspace


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
                workspace.delete()
                request.session.pop("routeguard_workspace_id", None)
                workspace = None
    if required and workspace is None:
        raise DomainError("Сессия не найдена. Откройте деморежим или войдите.", code="workspace_required", status_code=401)
    return workspace
