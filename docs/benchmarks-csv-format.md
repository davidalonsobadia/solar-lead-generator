# Industry EUI benchmarks CSV format

This document defines the CSV used to load the **per-industry electrical
energy-use intensity (EUI) table** into SolarLeadGeneration. The estimate engine
uses these figures to derive a building's annual electrical consumption from its
area. It is the source of truth for the loader in
`backend/app/domains/imports/service.py` (`ImportsService.import_benchmarks`),
exposed over HTTP as `POST /api/v1/imports/benchmarks`. A matching template with
the header row plus example rows lives at
[`frontend/public/benchmarks-template.csv`](../frontend/public/benchmarks-template.csv).

> All values are written in English. Blank cells are treated as `NULL`, except
> `region`, which falls back to a default (see below).

---

## 1. Columns

Each data row describes **one benchmark** for an `(industry, region)` pair. The
header must match these five columns, in this order:

| Column                  | Required | Maps to                                  | Notes |
| ----------------------- | -------- | ---------------------------------------- | ----- |
| `business_industry`     | yes      | `business_industry`                      | Join key matching `companies.business_industry`. |
| `eui_kwh_per_sqft_year` | yes      | `eui_kwh_per_sqft_year`                  | Electrical kWh per square foot per year. Must be **numeric and strictly positive**. |
| `region`                | no       | `region`                                 | Defaults to `us` when blank. Lets one industry hold one figure per region (e.g. a California value and a national fallback). |
| `source`                | no       | `source`                                 | Free text, e.g. `CBECS 2018`. |
| `notes`                 | no       | `notes`                                  | Free text, e.g. "Electrical only." |

---

## 2. Upsert behavior

Rows are **upserted by `(business_industry, region)`**:

- If no benchmark exists for the pair, a new row is inserted.
- If one already exists, its `eui_kwh_per_sqft_year`, `source`, and `notes` are
  **updated in place** — re-importing the same file never piles up duplicates.

The unique constraint `uq_industry_energy_benchmarks_industry_region` enforces
this at the database level.

---

## 3. Validation and error reporting

Validation is **per row** — one bad row does not abort the batch:

- `business_industry` must be non-empty.
- `eui_kwh_per_sqft_year` must be present, numeric, and strictly positive; a
  blank, non-numeric, zero, or negative value is reported as an error and the
  row is skipped.
- A row with the wrong number of columns is reported and skipped.

The response summarizes the run:

```json
{
  "rows_ok": 2,
  "benchmarks_created": 1,
  "benchmarks_updated": 1,
  "errors": [{ "line": 4, "reason": "eui_kwh_per_sqft_year: must be positive ('-3')" }]
}
```

A **structurally invalid file** (empty, or a header that does not match the
columns above) is a batch-level failure and returns `422`.

> **TODO (client):** real EUI figures (CBECS / CEUS) arrive later. The loader
> ships now; the table may stay empty until the client supplies them.

---

## 4. Example

```csv
business_industry,eui_kwh_per_sqft_year,region,source,notes
Retail,14.3,us,CBECS 2018,Electrical only.
Warehouse,8.5,us,CBECS 2018,
Retail,15.0,california,CEUS 2006,California-specific figure
```
