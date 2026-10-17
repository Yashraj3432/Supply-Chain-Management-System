"""Uniform error envelope for the API: {"detail": ..., "errors": {...}}.

Also converts Django ValidationErrors raised in the service layer
(e.g. insufficient stock) into HTTP 400 responses.
"""
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.views import exception_handler


def api_exception_handler(exc, context):
    if isinstance(exc, DjangoValidationError):
        exc = DRFValidationError(exc.message_dict if hasattr(exc, "error_dict") else {"non_field_errors": exc.messages})

    response = exception_handler(exc, context)
    if response is None:
        return None
    data = response.data
    if isinstance(data, dict) and "detail" in data and len(data) == 1:
        return response
    if isinstance(data, list):
        response.data = {"detail": data[0] if data else "Validation error.", "errors": {"non_field_errors": data}}
    elif isinstance(data, dict):
        detail = data.pop("detail", None)
        if detail is None:
            # Use the first field message as a human-readable summary.
            first = next(iter(data.values()), None)
            if isinstance(first, list) and first:
                first = first[0]
            detail = str(first) if isinstance(first, str) else "Validation error."
        response.data = {"detail": detail, "errors": data}
    return response
