"""CSV import service (CSV-02).

Parses the canonical property-import CSV (see ``docs/csv-format.md`` and
``backend/data/template.csv``), validates each row, and maps it to the
``properties`` / ``companies`` / ``stakeholders`` / ``leads`` tables — reusing
companies across properties so the same company is never duplicated.

The canonical row is **positional**, not name-keyed: a 13-column property block
followed by three identical 8-column stakeholder blocks whose order fixes the
role (``owner``, ``property_manager``, ``tenant``). Because the three blocks
share the same header names, the file is read with :class:`csv.reader` and split
by position rather than :class:`csv.DictReader`.

Error handling is **per row**: a malformed value (bad ``lat, lon``, a
non-numeric field, invalid ``Leads`` JSON, a missing required value) is recorded
against that row and the row is skipped, but the rest of the batch still
imports. A structurally invalid file (wrong header / column count) is a
batch-level failure and raises :class:`ValueError`.

There is intentionally no HTTP endpoint here — that is wired in CSV-03. The
service is framework-agnostic and follows the repo's ``<Domain>Service`` shape:
``__init__(self, db: Session)``. The caller owns the transaction lifecycle;
:meth:`ImportsService.import_csv` flushes but does not commit.
"""

from __future__ import annotations

import csv
import io
import json
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation

from sqlalchemy.orm import Session

from app.domains.companies.models import Company
from app.domains.leads.models import Lead
from app.domains.properties.models import Property
from app.domains.stakeholders.models import Stakeholder, StakeholderRole

# Canonical header. The property block is 13 columns; each of the three
# stakeholder blocks is the same 8 columns, distinguished only by position.
PROPERTY_COLUMNS = [
    "External ID",
    "Address",
    "Location",
    "Solar Rooftop Area",
    "Building Area",
    "Parcel Area",
    "Stories",
    "Zoning",
    "Parcel Use",
    "APN",
    "Structure Year Built",
    "Total Parcel Value",
    "Notes",
]
STAKEHOLDER_COLUMNS = [
    "Name",
    "Phone",
    "Email",
    "Linkedin",
    "Website",
    "Business Industry",
    "Annual Revenue",
    "Leads",
]
# Block index -> role. First block is the Owner, then Property Manager, Tenant.
BLOCK_ROLES = [
    StakeholderRole.owner,
    StakeholderRole.property_manager,
    StakeholderRole.tenant,
]

PROPERTY_BLOCK_SIZE = len(PROPERTY_COLUMNS)  # 13
STAKEHOLDER_BLOCK_SIZE = len(STAKEHOLDER_COLUMNS)  # 8
EXPECTED_HEADER = PROPERTY_COLUMNS + STAKEHOLDER_COLUMNS * len(BLOCK_ROLES)
EXPECTED_COLUMN_COUNT = len(EXPECTED_HEADER)  # 37


@dataclass
class RowError:
    """A single row that could not be imported, with the reason(s) why."""

    line: int
    reason: str


@dataclass
class ImportSummary:
    """Structured result of an import run.

    ``rows_ok`` counts data rows imported without error; ``errors`` lists the
    rows that were skipped and why. The ``*_created`` counters report how many
    new rows the run inserted (re-used companies/properties are not counted).
    """

    rows_ok: int = 0
    properties_created: int = 0
    companies_created: int = 0
    stakeholders_created: int = 0
    leads_created: int = 0
    errors: list[RowError] = field(default_factory=list)

    def __str__(self) -> str:  # pragma: no cover - convenience only
        return (
            f"rows_ok={self.rows_ok} properties={self.properties_created} "
            f"companies={self.companies_created} "
            f"stakeholders={self.stakeholders_created} "
            f"leads={self.leads_created} errors={len(self.errors)}"
        )


def _clean(value: str | None) -> str | None:
    """Trim a CSV cell, treating empty strings as missing values (``NULL``)."""
    if value is None:
        return None
    value = value.strip()
    return value or None


def _parse_decimal(value: str | None, label: str, errors: list[str]) -> Decimal | None:
    cleaned = _clean(value)
    if cleaned is None:
        return None
    try:
        return Decimal(cleaned)
    except (InvalidOperation, ValueError):
        errors.append(f"{label}: not a valid number ({cleaned!r})")
        return None


def _parse_int(value: str | None, label: str, errors: list[str]) -> int | None:
    cleaned = _clean(value)
    if cleaned is None:
        return None
    try:
        # Accept integral decimals like "1998"; reject "1.5" or "abc".
        number = Decimal(cleaned)
    except (InvalidOperation, ValueError):
        errors.append(f"{label}: not a valid integer ({cleaned!r})")
        return None
    if number != number.to_integral_value():
        errors.append(f"{label}: not a whole number ({cleaned!r})")
        return None
    return int(number)


def _parse_location(
    value: str | None, errors: list[str]
) -> tuple[Decimal | None, Decimal | None]:
    """Split the combined ``"lat, lon"`` cell into separate numbers.

    A blank cell yields ``(None, None)``; a malformed cell (not exactly two
    comma-separated numeric parts) is reported as a row error.
    """
    cleaned = _clean(value)
    if cleaned is None:
        return None, None
    parts = [p.strip() for p in cleaned.split(",")]
    if len(parts) != 2 or not all(parts):
        errors.append(f"location: malformed 'lat, lon' value ({cleaned!r})")
        return None, None
    lat = _parse_decimal(parts[0], "lat", errors)
    lon = _parse_decimal(parts[1], "lon", errors)
    return lat, lon


def _parse_leads_json(value: str | None, errors: list[str]) -> list[dict]:
    """Parse the ``Leads`` cell (a JSON array of lead objects, see §4 of the spec).

    An empty cell means no additional leads. A non-empty cell that is not valid
    JSON, is not a list, or whose elements lack a ``name`` is a row error.
    """
    cleaned = _clean(value)
    if cleaned is None:
        return []
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        errors.append("leads: not valid JSON")
        return []
    if not isinstance(data, list):
        errors.append("leads: must be a JSON array")
        return []
    leads: list[dict] = []
    for index, item in enumerate(data):
        if not isinstance(item, dict) or not _clean(item.get("name")):
            errors.append(f"leads[{index}]: missing required 'name'")
            continue
        leads.append(item)
    return leads


@dataclass
class _ParsedLead:
    name: str | None
    job_title: str | None = None
    email: str | None = None
    phone: str | None = None
    linkedin: str | None = None
    lead_location: str | None = None


@dataclass
class _ParsedBlock:
    role: StakeholderRole
    name: str
    website: str | None
    business_industry: str | None
    annual_revenue: Decimal | None
    leads: list[_ParsedLead]


@dataclass
class _ParsedRow:
    external_id: str | None
    address: str | None
    lat: Decimal | None
    lon: Decimal | None
    solar_rooftop_area: Decimal | None
    building_area: Decimal | None
    parcel_area: Decimal | None
    stories: int | None
    zoning: str | None
    parcel_use: str | None
    apn: str | None
    structure_year_built: int | None
    total_parcel_value: Decimal | None
    notes: str | None
    blocks: list[_ParsedBlock]


class ImportsService:
    """Parse and import the canonical property CSV into the relational model."""

    def __init__(self, db: Session):
        self.db = db

    def import_csv(self, content: str) -> ImportSummary:
        """Import CSV ``content`` (the full file text) and return a summary.

        Raises :class:`ValueError` if the file is empty or its header does not
        match the canonical template. Per-row problems do not raise — they are
        collected in :attr:`ImportSummary.errors` and the batch continues.
        """
        reader = csv.reader(io.StringIO(content))
        try:
            header = next(reader)
        except StopIteration as exc:
            raise ValueError("CSV is empty: no header row") from exc

        self._validate_header(header)

        summary = ImportSummary()
        for line_no, raw_row in enumerate(reader, start=2):
            if not any(_clean(cell) for cell in raw_row):
                # Fully blank line (e.g. a trailing newline) — silently ignore.
                continue
            self._import_row(raw_row, line_no, summary)
        return summary

    @staticmethod
    def _validate_header(header: list[str]) -> None:
        normalized = [cell.strip() for cell in header]
        if normalized != EXPECTED_HEADER:
            raise ValueError(
                "CSV header does not match the canonical template "
                f"(expected {EXPECTED_COLUMN_COUNT} columns: "
                f"{', '.join(EXPECTED_HEADER)})"
            )

    def _import_row(self, raw_row: list[str], line_no: int, summary: ImportSummary) -> None:
        if len(raw_row) != EXPECTED_COLUMN_COUNT:
            summary.errors.append(
                RowError(
                    line=line_no,
                    reason=(
                        f"expected {EXPECTED_COLUMN_COUNT} columns, "
                        f"got {len(raw_row)}"
                    ),
                )
            )
            return

        errors: list[str] = []
        parsed = self._parse_row(raw_row, errors)

        if errors:
            summary.errors.append(RowError(line=line_no, reason="; ".join(errors)))
            return

        self._persist_row(parsed, summary)
        summary.rows_ok += 1

    def _parse_row(self, raw_row: list[str], errors: list[str]) -> _ParsedRow:
        prop = raw_row[:PROPERTY_BLOCK_SIZE]

        address = _clean(prop[1])
        if address is None:
            errors.append("address: required")

        lat, lon = _parse_location(prop[2], errors)

        blocks: list[_ParsedBlock] = []
        for index, role in enumerate(BLOCK_ROLES):
            start = PROPERTY_BLOCK_SIZE + index * STAKEHOLDER_BLOCK_SIZE
            cells = raw_row[start : start + STAKEHOLDER_BLOCK_SIZE]
            block = self._parse_block(cells, role, errors)
            if block is not None:
                blocks.append(block)

        return _ParsedRow(
            external_id=_clean(prop[0]),
            address=address,
            lat=lat,
            lon=lon,
            solar_rooftop_area=_parse_decimal(prop[3], "solar_rooftop_area", errors),
            building_area=_parse_decimal(prop[4], "building_area", errors),
            parcel_area=_parse_decimal(prop[5], "parcel_area", errors),
            stories=_parse_int(prop[6], "stories", errors),
            zoning=_clean(prop[7]),
            parcel_use=_clean(prop[8]),
            apn=_clean(prop[9]),
            structure_year_built=_parse_int(prop[10], "structure_year_built", errors),
            total_parcel_value=_parse_decimal(prop[11], "total_parcel_value", errors),
            notes=_clean(prop[12]),
            blocks=blocks,
        )

    def _parse_block(
        self, cells: list[str], role: StakeholderRole, errors: list[str]
    ) -> _ParsedBlock | None:
        name = _clean(cells[0])
        if name is None:
            # Empty block: skipped entirely (no company / stakeholder / lead).
            return None

        annual_revenue = _parse_decimal(
            cells[6], f"{role.value}.annual_revenue", errors
        )
        extra_leads = _parse_leads_json(cells[7], errors)

        # The block's own contact is the company's primary lead. Its name
        # defaults to the company name (the "stakeholder is its own lead" case).
        primary = _ParsedLead(
            name=name,
            email=_clean(cells[2]),
            phone=_clean(cells[1]),
            linkedin=_clean(cells[3]),
        )
        leads = [primary]
        for item in extra_leads:
            leads.append(
                _ParsedLead(
                    name=_clean(item.get("name")),
                    job_title=_clean(item.get("job_title")),
                    email=_clean(item.get("email")),
                    phone=_clean(item.get("phone")),
                    linkedin=_clean(item.get("linkedin")),
                    lead_location=_clean(item.get("location")),
                )
            )

        return _ParsedBlock(
            role=role,
            name=name,
            website=_clean(cells[4]),
            business_industry=_clean(cells[5]),
            annual_revenue=annual_revenue,
            leads=leads,
        )

    def _persist_row(self, parsed: _ParsedRow, summary: ImportSummary) -> None:
        prop = self._upsert_property(parsed, summary)
        for block in parsed.blocks:
            company = self._upsert_company(block, summary)
            self._ensure_stakeholder(prop, company, block.role, summary)
            for lead in block.leads:
                self._ensure_lead(company, lead, summary)

    def _upsert_property(self, parsed: _ParsedRow, summary: ImportSummary) -> Property:
        prop = None
        if parsed.external_id is not None:
            prop = (
                self.db.query(Property)
                .filter(Property.external_id == parsed.external_id)
                .first()
            )
        if prop is None:
            prop = Property(
                external_id=parsed.external_id,
                address=parsed.address,
                lat=parsed.lat,
                lon=parsed.lon,
                solar_rooftop_area=parsed.solar_rooftop_area,
                building_area=parsed.building_area,
                parcel_area=parsed.parcel_area,
                stories=parsed.stories,
                zoning=parsed.zoning,
                parcel_use=parsed.parcel_use,
                apn=parsed.apn,
                structure_year_built=parsed.structure_year_built,
                total_parcel_value=parsed.total_parcel_value,
                notes=parsed.notes,
            )
            self.db.add(prop)
            self.db.flush()
            summary.properties_created += 1
        return prop

    def _upsert_company(self, block: _ParsedBlock, summary: ImportSummary) -> Company:
        company = (
            self.db.query(Company)
            .filter(Company.name == block.name, Company.website == block.website)
            .first()
        )
        if company is None:
            company = Company(
                name=block.name,
                website=block.website,
                business_industry=block.business_industry,
                annual_revenue=block.annual_revenue,
            )
            self.db.add(company)
            self.db.flush()
            summary.companies_created += 1
        return company

    def _ensure_stakeholder(
        self,
        prop: Property,
        company: Company,
        role: StakeholderRole,
        summary: ImportSummary,
    ) -> None:
        existing = (
            self.db.query(Stakeholder)
            .filter_by(property_id=prop.id, role=role)
            .first()
        )
        if existing is None:
            self.db.add(
                Stakeholder(property_id=prop.id, company_id=company.id, role=role)
            )
            self.db.flush()
            summary.stakeholders_created += 1

    def _ensure_lead(
        self, company: Company, lead: _ParsedLead, summary: ImportSummary
    ) -> None:
        # Dedup by email when present, otherwise by name, so re-importing the
        # same file does not pile up duplicate leads for a company.
        query = self.db.query(Lead).filter(Lead.company_id == company.id)
        if lead.email is not None:
            query = query.filter(Lead.email == lead.email)
        else:
            query = query.filter(Lead.email.is_(None), Lead.name == lead.name)
        if query.first() is None:
            self.db.add(
                Lead(
                    company_id=company.id,
                    name=lead.name,
                    job_title=lead.job_title,
                    email=lead.email,
                    phone=lead.phone,
                    linkedin=lead.linkedin,
                    lead_location=lead.lead_location,
                )
            )
            self.db.flush()
            summary.leads_created += 1
