// Leads feature API client (client-side).
// Calls the Next.js route handler under /api/properties/{id}/leads, which
// proxies to the backend. Never call the backend directly from here.
import { config } from "@/lib/config"

/** The company a lead belongs to (backend BE-03 LeadCompany). */
export interface LeadCompany {
  id: number
  name: string
  website: string | null
  business_industry: string | null
  // Decimal revenue may arrive as a JSON number or string depending on the
  // backend encoder.
  annual_revenue: number | string | null
}

/** A single decision-maker resolved for a property (backend BE-03 LeadItem). */
export interface LeadItem {
  id: number
  name: string | null
  job_title: string | null
  email: string | null
  phone: string | null
  linkedin: string | null
  lead_location: string | null
  // The role the lead's company plays for the property:
  // owner | tenant | property_manager.
  role: string
  company: LeadCompany
  created_at: string | null
}

/** A page of leads for a property plus pagination metadata. */
export interface LeadListResponse {
  items: LeadItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

/** Query params accepted by the leads list endpoint (BE-03). */
export interface LeadListParams {
  jobTitle?: string
  role?: string
  location?: string
  q?: string
  page?: number
  pageSize?: number
}

/** Build the backend query string from list params, omitting empty values. */
function buildQuery(params: LeadListParams): string {
  const search = new URLSearchParams()
  if (params.jobTitle) search.set("job_title", params.jobTitle)
  if (params.role) search.set("role", params.role)
  if (params.location) search.set("location", params.location)
  if (params.q) search.set("q", params.q)
  if (params.page) search.set("page", String(params.page))
  if (params.pageSize) search.set("page_size", String(params.pageSize))
  const query = search.toString()
  return query ? `?${query}` : ""
}

export const leadsApi = {
  /** Fetch a page of leads for a property from the route handler. */
  async list(
    propertyId: string | number,
    params: LeadListParams = {},
  ): Promise<LeadListResponse> {
    const response = await fetch(
      `${config.api.endpoints.properties.leads(String(propertyId))}${buildQuery(params)}`,
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
        `Failed to load leads (HTTP ${response.status} ${response.statusText}).`
      throw new Error(message)
    }

    return data as LeadListResponse
  },
}
