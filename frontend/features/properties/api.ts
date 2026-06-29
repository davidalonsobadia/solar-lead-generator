// Properties feature API client (client-side).
// Calls the Next.js route handler under /api/properties, which proxies to the
// backend. Never call the backend directly from here.
import { config } from "@/lib/config"

/** A single property row shown on the Results screen (backend BE-01). */
export interface PropertyListItem {
  id: number
  external_id: string | null
  address: string | null
  city: string | null
  industry: string | null
  owner_company_id: number | null
  owner_company_name: string | null
  // Decimal area metrics may arrive as a JSON number or string depending on
  // the backend encoder, so callers must coerce before formatting.
  solar_rooftop_area: number | string | null
  building_area: number | string | null
  parcel_area: number | string | null
  leads: number
  has_estimate: boolean
}

/** A page of property rows plus pagination metadata. */
export interface PropertyListResponse {
  items: PropertyListItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export const propertiesApi = {
  /** Fetch a page of properties from the route handler. */
  async list(): Promise<PropertyListResponse> {
    const response = await fetch(config.api.endpoints.properties.base)

    let data: unknown = null
    try {
      data = await response.json()
    } catch {
      data = null
    }

    if (!response.ok || !data) {
      const message =
        (data as { message?: string } | null)?.message ||
        `Failed to load properties (HTTP ${response.status} ${response.statusText}).`
      throw new Error(message)
    }

    return data as PropertyListResponse
  },
}
