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

    // The route handler always responds with JSON, but guard against a
    // non-JSON body (e.g. a 502 from a misconfigured proxy) so we surface a
    // meaningful error instead of a SyntaxError.
    let data: ImportCsvResult | null = null
    try {
      data = (await response.json()) as ImportCsvResult
    } catch {
      data = null
    }

    if (!response.ok || !data) {
      return {
        success: false,
        message:
          data?.message ||
          `Upload failed (HTTP ${response.status} ${response.statusText}).`,
      }
    }

    return data
  },
}
