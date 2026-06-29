"""Server-side PDF rendering for a solar estimate (EPIC 11 · export).

Builds a clean one-pager from a persisted :class:`~app.domains.estimates.models.Estimate`
and its :class:`~app.domains.properties.models.Property`: the Project Economics the
engine produced plus the property data the estimate describes. Rendering is done with
``reportlab`` (a pure-Python dependency, so no native libraries are needed in CI) and the
function returns the PDF as ``bytes`` for the route to stream back.

There is intentionally no styling system here — just a readable layout. Email/send is out
of scope.
"""

from __future__ import annotations

import io
from decimal import Decimal
from typing import Any, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from ..properties.models import Property
from .models import Estimate


def _money(value: Any) -> str:
    """Format a stored number as ``$1,234`` (em dash when unset)."""
    if value is None:
        return "—"
    return f"${float(value):,.0f}"


def _number(value: Any, suffix: str = "") -> str:
    """Format a stored number with thousands separators (em dash when unset)."""
    if value is None:
        return "—"
    return f"{float(value):,.0f}{suffix}"


def _percent(value: Any) -> str:
    """Format a stored fraction (e.g. ``0.123``) as a percentage."""
    if value is None:
        return "—"
    return f"{float(value) * 100:,.1f}%"


def _decimal(value: Any, suffix: str = "") -> str:
    """Format a stored number with one decimal place (em dash when unset)."""
    if value is None:
        return "—"
    return f"{float(value):,.1f}{suffix}"


def _text(value: Optional[Any]) -> str:
    """Render an optional text/number field (em dash when unset)."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return "—"
    if isinstance(value, Decimal):
        return f"{float(value):,.0f}"
    return str(value)


def _section(title: str, rows: list[tuple[str, str]], styles) -> list:
    """A titled two-column table of label/value rows."""
    flow: list = [Paragraph(title, styles["Heading2"])]
    table = Table(rows, colWidths=[2.6 * inch, 3.4 * inch])
    table.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#555555")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("LINEBELOW", (0, 0), (-1, -2), 0.25, colors.HexColor("#e5e5e5")),
            ]
        )
    )
    flow.append(table)
    flow.append(Spacer(1, 0.25 * inch))
    return flow


def build_estimate_pdf(estimate: Estimate, property_obj: Property) -> bytes:
    """Render a one-page PDF of an estimate's economics and property data.

    Returns the encoded PDF as ``bytes``. Missing values render as an em dash so
    a partially-computed estimate still produces a complete document.
    """
    styles = getSampleStyleSheet()
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        title=f"Solar Estimate #{estimate.id}",
        leftMargin=0.9 * inch,
        rightMargin=0.9 * inch,
        topMargin=0.9 * inch,
        bottomMargin=0.9 * inch,
    )

    flow: list = [
        Paragraph("Solar Estimate", styles["Title"]),
        Paragraph(
            _text(property_obj.address) if property_obj.address else "Property",
            styles["Heading3"],
        ),
        Spacer(1, 0.25 * inch),
    ]

    flow += _section(
        "Project Economics",
        [
            ("System size", _decimal(estimate.system_size_kw, " kW")),
            ("Annual production", _number(estimate.annual_production_kwh, " kWh")),
            ("System cost", _money(estimate.system_cost)),
            ("Net cost (after incentives)", _money(estimate.net_cost)),
            ("Annual savings (year 1)", _money(estimate.annual_savings)),
            ("20-year savings", _money(estimate.savings_20yr)),
            ("IRR", _percent(estimate.irr)),
            ("NPV", _money(estimate.npv)),
            ("Simple payback", _decimal(estimate.simple_payback_years, " years")),
            ("CO₂ offset (20 years)", _number(estimate.co2_offset_20yr, " kg")),
        ],
        styles,
    )

    flow += _section(
        "Property",
        [
            ("Address", _text(property_obj.address)),
            ("External id", _text(property_obj.external_id)),
            ("Building area", _number(property_obj.building_area, " sq ft")),
            ("Solar rooftop area", _number(property_obj.solar_rooftop_area, " sq ft")),
            ("Parcel area", _number(property_obj.parcel_area, " sq ft")),
            ("Stories", _text(property_obj.stories)),
            ("Year built", _text(property_obj.structure_year_built)),
            ("Zoning", _text(property_obj.zoning)),
            ("Parcel use", _text(property_obj.parcel_use)),
            ("APN", _text(property_obj.apn)),
        ],
        styles,
    )

    doc.build(flow)
    return buffer.getvalue()
