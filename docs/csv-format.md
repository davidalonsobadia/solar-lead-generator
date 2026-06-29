# Canonical property-import CSV format

This document defines the **official CSV template** used to import properties and their
stakeholders into SolarLeadGeneration. It is the source of truth for the parser built in
CSV-02 (`backend/app/services/csv_import.py`). The matching template lives at
[`backend/data/template.csv`](../backend/data/template.csv) and carries the exact header
row plus one valid example row (Costco).

> All values are written in English. Blank cells are treated as `NULL` by the importer.

---

## 1. Row shape

Each data row describes **one property** followed by **three stakeholder blocks** in a
fixed order:

```
[ property block ] [ Owner block ] [ Property Manager block ] [ Tenant block ]
```

- The property block is 13 columns.
- Each stakeholder block is the **same 8 columns**:
  `Name, Phone, Email, Linkedin, Website, Business Industry, Annual Revenue, Leads`.
- The three stakeholder blocks **share identical column names**; they are distinguished
  **only by position/order** — first block is the **Owner**, second is the
  **Property Manager**, third is the **Tenant**. The parser maps block index → role
  (`owner`, `property_manager`, `tenant`); it does not rely on the header text to tell
  the blocks apart.

A full row therefore has `13 + 8 × 3 = 37` columns.

A stakeholder block is **optional**: if its `Name` cell is blank, the whole block is
considered empty and is skipped (no company, stakeholder, or lead is created for that
role). In the MVP only the **Owner** block is required to be useful; Property Manager and
Tenant may be left empty.

---

## 2. Property block → `properties`

| # | Column | Type | Required? | DB field (`properties`) |
|---|--------|------|-----------|--------------------------|
| 1 | External ID | string | No | `external_id` |
| 2 | Address | string | Yes | `address` |
| 3 | Location | string `"lat, lon"` | No | split into `lat`, `lon` (Numeric) |
| 4 | Solar Rooftop Area | number (sq ft) | No | `solar_rooftop_area` |
| 5 | Building Area | number (sq ft) | No | `building_area` |
| 6 | Parcel Area | number (sq ft) | No | `parcel_area` |
| 7 | Stories | integer | No | `stories` |
| 8 | Zoning | string | No | `zoning` |
| 9 | Parcel Use | string | No | `parcel_use` |
| 10 | APN | string | No | `apn` |
| 11 | Structure Year Built | integer | No | `structure_year_built` |
| 12 | Total Parcel Value | number (USD) | No | `total_parcel_value` |
| 13 | Notes | string | No | `notes` |

Notes:

- **Address** is the only practically required property field — it identifies the
  building. Every other field is optional and stored as `NULL` when blank.
- **Location** is a single cell holding `"latitude, longitude"` (e.g.
  `"37.7806, -122.4109"`). The importer splits it into the separate `lat` and `lon`
  Numeric columns. A malformed value (missing comma, non-numeric parts) is reported as a
  row error.
- Numeric columns accept plain digits only (no thousands separators or currency symbols):
  `12500000`, not `12,500,000` or `$12.5M`.

---

## 3. Stakeholder block → `companies`, `stakeholders`, `leads`

Each non-empty block creates / reuses one **company**, one **stakeholder** relation
(linking the property to that company with the block's role), and one or more **leads**.

| # | Column | Type | Required? | DB field |
|---|--------|------|-----------|----------|
| 1 | Name | string | Yes (if block non-empty) | `companies.name` |
| 2 | Phone | string | No | `leads.phone` (primary lead) |
| 3 | Email | string | No | `leads.email` (primary lead) |
| 4 | Linkedin | URL | No | `leads.linkedin` (primary lead) |
| 5 | Website | URL | No | `companies.website` |
| 6 | Business Industry | string | No | `companies.business_industry` |
| 7 | Annual Revenue | number (USD) | No | `companies.annual_revenue` |
| 8 | Leads | JSON array (see §4) | No | additional `leads` rows |

How a block maps to the tables:

- **Company** — `Name`, `Website`, `Business Industry`, `Annual Revenue`. Companies are
  reusable across properties and are upserted by `(name, website)` (the unique constraint
  `uq_companies_name_website`). The same company appearing under two properties is **not**
  duplicated.
- **Stakeholder** — the relation `(property_id, company_id, role)`, where `role` is
  derived from the block position (Owner / Property Manager / Tenant). One stakeholder per
  role per property (`uq_stakeholders_property_role`).
- **Primary lead** — the block's `Name`, `Phone`, `Email`, `Linkedin` describe the
  company's main contact (the "stakeholder is its own lead" case). The importer creates
  one lead from these columns; its `name` defaults to the company `Name`, and its
  `job_title`/`lead_location` are left `NULL` unless supplied via the `Leads` field.
- **Additional leads** — the `Leads` field (§4) lists any further decision-makers at that
  company as extra `leads` rows.

---

## 4. The `Leads` field format (pinned down)

**Decision: the `Leads` cell is a JSON array of lead objects.** This is the explicit
contract CSV-02 implements.

```json
[
  {
    "name": "Morgan Lee",
    "job_title": "VP of Real Estate",
    "email": "morgan.lee@costco.example",
    "phone": "+1-415-555-0111",
    "linkedin": "https://www.linkedin.com/in/morgan-lee-costco",
    "location": "San Francisco, CA"
  }
]
```

Rules:

- An **empty cell** means *no additional leads* — only the primary lead built from the
  block's `Name`/`Phone`/`Email`/`Linkedin` is created.
- Each array element is an object mapping to the `leads` table:

  | JSON key | `leads` field | Required? |
  |----------|---------------|-----------|
  | `name` | `name` | Yes |
  | `job_title` | `job_title` | No |
  | `email` | `email` | No |
  | `phone` | `phone` | No |
  | `linkedin` | `linkedin` | No |
  | `location` | `lead_location` | No |

- Because the cell contains commas and quotes, it **must be CSV-quoted** and inner double
  quotes **escaped by doubling** (`""`), per RFC 4180. Spreadsheet editors do this
  automatically; see the example row in `template.csv`.
- A cell that is non-empty but not valid JSON (or whose elements are missing `name`) is
  reported as a row error.

### Why JSON, and not a count or a name list

The three candidate formats were a bare **count** (e.g. `3`), a **delimited list of
names**, or **JSON**:

- A **count** carries no contact data, so CSV-02 could not create usable `leads` rows
  (leads exist to be contacted by email / phone / LinkedIn).
- A **list of names** loses `job_title`, `email`, `phone`, and `linkedin` — the fields
  that make a lead actionable.
- **JSON** preserves the full `leads` structure, is unambiguous to parse, and round-trips
  losslessly to the database. It is the only option that satisfies CSV-02's requirement to
  materialize complete lead records.

---

## 5. Example row (Costco)

`template.csv` ships with this canonical example, which CSV-02's tests parse successfully:

- **Property** — Costco at *1051 Market St, San Francisco, CA 94103*,
  location `"37.7806, -122.4109"`, retail zoning, etc.
- **Owner** — *Costco Wholesale* (Retail), with a primary contact and one additional lead
  in the `Leads` JSON array.
- **Property Manager** — *CBRE Group* (Commercial Real Estate), primary contact only,
  empty `Leads`.
- **Tenant** — empty block (demonstrates that an unused role is simply left blank).
