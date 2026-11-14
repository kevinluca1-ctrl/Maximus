"""Google-Kalender-Anbindung. Phase 6: noch nicht umgesetzt, die Endpunkte melden das ehrlich zurück."""
from fastapi import HTTPException


def status():
    return {"configured": False, "connected": False, "note": "Kalender-Sync folgt in Phase 6"}


def _todo(*_a, **_k):
    raise HTTPException(501, "Kalender-Sync ist noch nicht umgesetzt (Phase 6)")


auth_url = exchange = sync_plan = override_day = _todo
