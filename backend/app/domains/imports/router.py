"""HTTP endpoint for the CSV import service (CSV-03).

Exposes ``POST /imports/csv`` (mounted under ``/api/v1`` by
``app.api.router``) so the admin UI can upload the canonical property CSV. The
router is intentionally thin: it validates the upload, delegates parsing and
persistence to :class:`ImportsService`, owns the transaction (the service only
flushes), and returns the CSV-02 summary.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app import logger
from app.db.session import get_db
from app.domains.auth.models import User
from app.domains.auth.utils import get_verified_user

from .schemas import ImportSummaryResponse
from .service import ImportsService

router = APIRouter(prefix="/imports", tags=["imports"])


@router.post("/csv", response_model=ImportSummaryResponse)
async def import_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_verified_user),
) -> ImportSummaryResponse:
    """Import the canonical property CSV uploaded as ``multipart/form-data``.

    Returns ``200`` with the import summary on success. Responds ``422`` when
    the file is missing, is not a ``.csv``, is not valid UTF-8 text, or its
    header does not match the canonical template.
    """
    filename = file.filename or ""
    if not filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Uploaded file must have a .csv extension.",
        )

    raw = await file.read()
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Uploaded file is empty.",
        )

    try:
        # ``utf-8-sig`` transparently strips a leading BOM if present.
        content = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Uploaded file is not valid UTF-8 text.",
        ) from exc

    service = ImportsService(db)
    try:
        summary = service.import_csv(content)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    db.commit()
    logger.info(
        "CSV import by user %s: %s", current_user.id, summary
    )
    return ImportSummaryResponse.model_validate(summary)
