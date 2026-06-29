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

/** Structured result of an industry EUI benchmarks import run. */
export interface BenchmarkImportSummary {
  rows_ok: number
  benchmarks_created: number
  benchmarks_updated: number
  errors: RowError[]
}

/** Response envelope returned by the /api/imports/csv route handler. */
export interface ImportCsvResult {
  success: boolean
  message?: string
  summary?: ImportSummary
}

/** Response envelope returned by the /api/imports/benchmarks route handler. */
export interface BenchmarkImportResult {
  success: boolean
  message?: string
  summary?: BenchmarkImportSummary
}

/** POST a CSV file to a route handler and decode its `{ success, summary }` envelope. */
async function uploadCsvFile<T extends { success: boolean; message?: string }>(
  endpoint: string,
  file: File,
): Promise<T> {
  const formData = new FormData()
  formData.append("file", file)

  const response = await fetch(endpoint, {
    method: "POST",
    body: formData,
  })

  // The route handler always responds with JSON, but guard against a
  // non-JSON body (e.g. a 502 from a misconfigured proxy) so we surface a
  // meaningful error instead of a SyntaxError.
  let data: T | null = null
  try {
    data = (await response.json()) as T
  } catch {
    data = null
  }

  if (!response.ok || !data) {
    return {
      success: false,
      message:
        data?.message ||
        `Upload failed (HTTP ${response.status} ${response.statusText}).`,
    } as T
  }

  return data
}

export const importsApi = {
  /** Upload the property CSV to the import endpoint and return the summary. */
  uploadCsv(file: File): Promise<ImportCsvResult> {
    return uploadCsvFile<ImportCsvResult>(config.api.endpoints.imports.csv, file)
  },

  /** Upload the industry EUI benchmarks CSV and return the summary. */
  uploadBenchmarks(file: File): Promise<BenchmarkImportResult> {
    return uploadCsvFile<BenchmarkImportResult>(
      config.api.endpoints.imports.benchmarks,
      file,
    )
  },
}
