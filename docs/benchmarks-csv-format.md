# Industry EUI benchmark CSV format

This document defines the CSV used to load the **industry energy-use intensity (EUI)**
table. These figures let the estimate engine derive a building's annual electrical
consumption from its area. The loader lives in
[`backend/app/domains/imports/service.py`](../backend/app/domains/imports/service.py)
(`ImportsService.import_benchmarks`) and is exposed at
`POST /api/v1/imports/benchmarks`.

> All values are written in English. Blank cells are treated as `NULL` by the importer.

---

## 1. Row shape

Unlike the positional property template, this file is **name-keyed**: a header row
naming the columns, then one row per `(business_industry, region)` figure. Column order
does not matter and unknown columns are ignored.

| Column                  | Required | Notes                                                            |
| ----------------------- | -------- | ---------------------------------------------------------------- |
| `business_industry`     | yes      | Join key matching `companies.business_industry`.                 |
| `eui_kwh_per_sqft_year` | yes      | Electrical kWh per square foot per year. Must be numeric and **strictly positive**. |
| `region`                | no       | Defaults to `us` when blank. Lets one industry hold one figure per region. |
| `source`                | no       | Free-text provenance (e.g. `CBECS 2018`).                        |
| `notes`                 | no       | Free-text remarks.                                               |

A row whose required columns are present and valid is applied; everything else is
reported as a per-row error (see §3).

---

## 2. Upsert by `(business_industry, region)`

The `industry_energy_benchmarks` table has a unique constraint on
`(business_industry, region)` (`uq_industry_energy_benchmarks_industry_region`). The
loader upserts on that pair:

- a row whose `(business_industry, region)` is new is **inserted**;
- a row whose `(business_industry, region)` already exists is **updated** in place
  (its `eui_kwh_per_sqft_year`, `source`, and `notes` are overwritten).

Re-importing the same file is therefore idempotent — it never creates duplicates. The
same industry with two different regions (e.g. `us` and `california`) yields two
distinct rows.

---

## 3. Error handling

Error handling is **per row**, mirroring the property importer:

- a missing `business_industry`,
- a missing, non-numeric, `NaN`/`Infinity`, or non-positive `eui_kwh_per_sqft_year`

is recorded against that row's line number and the row is skipped, but the rest of the
batch still imports. A structurally invalid file (empty, or missing a required column)
is a batch-level failure and returns `422`.

The endpoint returns a summary:

```json
{
  "rows_ok": 2,
  "benchmarks_created": 1,
  "benchmarks_updated": 1,
  "errors": [{ "line": 4, "reason": "eui_kwh_per_sqft_year: must be positive ('-3')" }]
}
```

---

## 4. Example

```csv
business_industry,eui_kwh_per_sqft_year,region,source,notes
Retail,14.5,us,CBECS 2018,National average
Warehouse,7.2,us,CBECS 2018,
Retail,16.1,california,CEUS 2006,California-specific override
```

> **TODO (client):** real EUI figures (CBECS / CEUS) arrive later. The loader ships now;
> the table may stay empty until those numbers are supplied.
