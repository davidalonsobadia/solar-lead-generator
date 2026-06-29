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

/** Sortable keys exposed by the backend list endpoint (BE-01). */
export type PropertySortBy =
  | "rooftop_area"
  | "building_area"
  | "leads"
  | "company_name"

/** Sort direction. */
export type SortOrder = "asc" | "desc"

/** Query params accepted by the properties list endpoint. */
export interface PropertyListParams {
  industry?: string
  city?: string
  sortBy?: PropertySortBy
  order?: SortOrder
  page?: number
  pageSize?: number
}

/** Build the backend query string from list params, omitting empty values. */
function buildQuery(params: PropertyListParams): string {
  const search = new URLSearchParams()
  if (params.industry) search.set("industry", params.industry)
  if (params.city) search.set("city", params.city)
  if (params.sortBy) search.set("sort_by", params.sortBy)
  if (params.order) search.set("order", params.order)
  if (params.page) search.set("page", String(params.page))
  if (params.pageSize) search.set("page_size", String(params.pageSize))
  const query = search.toString()
  return query ? `?${query}` : ""
}

export const propertiesApi = {
  /** Fetch a page of properties from the route handler. */
  async list(params: PropertyListParams = {}): Promise<PropertyListResponse> {
    const response = await fetch(
      `${config.api.endpoints.properties.base}${buildQuery(params)}`,
    )

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
