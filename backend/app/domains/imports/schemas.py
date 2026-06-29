"""Pydantic response schemas for the CSV import endpoint (CSV-03).

These mirror the dataclasses returned by :class:`app.domains.imports.service`
(``ImportSummary`` / ``RowError``) so the import result can be serialized over
HTTP. ``from_attributes`` lets the router build them straight from the service
dataclasses with :meth:`model_validate`.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class RowErrorResponse(BaseModel):
    """A single data row that could not be imported, with the reason why."""

    model_config = ConfigDict(from_attributes=True)

    line: int
    reason: str


class ImportSummaryResponse(BaseModel):
    """Structured result of a CSV import run (the CSV-02 summary)."""

    model_config = ConfigDict(from_attributes=True)

    rows_ok: int
    properties_created: int
    companies_created: int
    stakeholders_created: int
    leads_created: int
    errors: list[RowErrorResponse]
