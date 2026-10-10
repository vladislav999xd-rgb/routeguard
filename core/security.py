from rest_framework.authentication import SessionAuthentication


class CsrfSessionAuthentication(SessionAuthentication):
    """Enforce CSRF for both authenticated staff and session-backed demo users."""

    def authenticate(self, request):
        user = getattr(request._request, "user", None)
        self.enforce_csrf(request)
        if not user or not user.is_active or not user.is_authenticated:
            return None
        return user, None
