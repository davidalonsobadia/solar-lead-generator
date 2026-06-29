// Imports feature API client (client-side).
// Calls the Next.js route handler under /api/imports, which proxies to the
// backend. Never call the backend directly from here.
import { config } from "@/lib/config"

/** A single data row the backend could not import, with the reason why. */
export interface RowError {
  line: number
  reason: string
}

/** Structured result of a CSV import run (the backend CSV-02 summary). */
export interface ImportSummary {
  rows_ok: number
  properties_created: number
  companies_created: number
  stakeholders_created: number
  leads_created: number
  errors: RowError[]
}

/** Response envelope returned by the /api/imports/csv route handler. */
export interface ImportCsvResult {
  success: boolean
  message?: string
  summary?: ImportSummary
}

export const importsApi = {
  /** Upload a CSV file to the import endpoint and return the summary. */
  async uploadCsv(file: File): Promise<ImportCsvResult> {
    const formData = new FormData()
    formData.append("file", file)

    const response = await fetch(config.api.endpoints.imports.csv, {
      method: "POST",
      body: formData,
    })

    return response.json()
  },
}
