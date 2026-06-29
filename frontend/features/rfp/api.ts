// Client-side RFP API: calls the Next.js route handler, never the backend.
import { config } from "@/lib/config"

/** Requested scope and free-form context, stored in the RFP's JSON payload. */
export interface RfpPayload {
  organization_name?: string | null
  property_address?: string | null
  /** "grid_tied", "hybrid" or "off_grid". */
  system_type?: string | null
  /** Approximate system size in kW (kept as a number when provided). */
  approx_size_kw?: number | null
  include_bess?: boolean
  notes?: string | null
}

/** Inputs accepted by `POST /api/v1/rfp` (backend RfpCreate). */
export interface RfpCreateInput {
  property_id?: number | null
  payload: RfpPayload
  contact_name?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  contact_company?: string | null
  status?: string
}

/** A persisted RFP as returned by the API (backend RfpRead). */
export interface Rfp {
  id: number
  property_id: number | null
  payload: RfpPayload
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  contact_company: string | null
  status: string | null
  created_at: string | null
}

/** Parse a route-handler JSON body, tolerating a non-JSON error response. */
async function parseJson<T>(response: Response): Promise<T> {
  let data: unknown = null
  try {
    data = await response.json()
  } catch {
    data = null
  }

  if (!response.ok || !data) {
    const message =
      (data as { message?: string } | null)?.message ||
      `Request failed (HTTP ${response.status} ${response.statusText}).`
    throw new Error(message)
  }

  return data as T
}

export const rfpApi = {
  /** Persist an RFP via the route handler (proxies to POST /api/v1/rfp). */
  async create(input: RfpCreateInput): Promise<Rfp> {
    const response = await fetch(config.api.endpoints.rfp.base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    return parseJson<Rfp>(response)
  },
}
