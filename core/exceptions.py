from __future__ import annotations

import logging

from django.db import IntegrityError
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


class DomainError(Exception):
    def __init__(self, message: str, *, code: str = "invalid_action", status_code: int = 400):
        self.message = message
        self.code = code
        self.status_code = status_code
        super().__init__(message)


def safe_exception_handler(exc, context):
    if isinstance(exc, DomainError):
        return Response({"error": {"code": exc.code, "message": exc.message}}, status=exc.status_code)
    if isinstance(exc, IntegrityError):
        logger.warning("Database constraint rejected a request", exc_info=exc)
        return Response(
            {"error": {"code": "conflict", "message": "Данные уже изменились. Обновите страницу и повторите действие."}},
            status=409,
        )
    response = exception_handler(exc, context)
    if response is not None:
        detail = response.data.get("detail") if isinstance(response.data, dict) else None
        response.data = {"error": {"code": "request_error", "message": str(detail or "Проверьте введённые данные.")}}
        return response
    logger.exception("Unhandled API error", exc_info=exc)
    return Response(
        {"error": {"code": "server_error", "message": "Не удалось выполнить действие. Повторите попытку позже."}},
        status=500,
    )
