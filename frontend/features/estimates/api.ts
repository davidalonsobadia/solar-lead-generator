// Client-side estimates API: calls the Next.js route handlers, never the backend.
import { config } from "@/lib/config"

// Decimal columns arrive as a JSON number or string; callers must coerce.
type Numeric = number | string | null

/** A single incentive applied to the gross system cost (backend SOLAR-03). */
export interface Incentive {
  name?: string | null
  /** "percentage" (a fraction of gross cost) or "fixed" (an absolute amount). */
  type: string
  value: number
}

/** Inputs accepted by the estimate create/recalculate endpoints. */
export interface EstimateInput {
  system_size_kw?: number
  price_per_watt?: number
  system_losses_pct?: number
  shading_pct?: number
  annual_consumption_kwh?: number
  blended_utility_rate?: number
  rate_escalation_pct?: number
  include_bess?: boolean
  incentives?: Incentive[]
}

/** An estimate's persisted inputs and engine outputs (backend EstimateRead). */
export interface Estimate {
  id: number
  property_id: number

  system_size_kw: Numeric
  price_per_watt: Numeric
  system_losses_pct: Numeric
  shading_pct: Numeric
  annual_consumption_kwh: Numeric
  blended_utility_rate: Numeric
  rate_escalation_pct: Numeric
  include_bess: boolean | null
  incentives: Incentive[] | null

  annual_production_kwh: Numeric
  system_cost: Numeric
  net_cost: Numeric
  annual_savings: Numeric
  savings_20yr: Numeric
  irr: Numeric
  npv: Numeric
  simple_payback_years: Numeric
  co2_offset_20yr: Numeric

  // "complete", or a reason consumption could not be auto-filled (shown as a notice).
  status: string | null
  created_at: string | null
  updated_at: string | null
}

/** A stakeholder's company as shown on the property detail screen. */
export interface CompanyDetail {
  id: number
  name: string
  website: string | null
  business_industry: string | null
  annual_revenue: Numeric
}

/** A property's stakeholder (its role) plus the associated company. */
export interface StakeholderDetail {
  id: number
  role: string
  company: CompanyDetail
}

/** A single property with its stakeholders and most recent estimate. */
export interface PropertyDetail {
  id: number
  external_id: string | null
  address: string | null
  lat: Numeric
  lon: Numeric
  solar_rooftop_area: Numeric
  building_area: Numeric
  parcel_area: Numeric
  stories: number | null
  zoning: string | null
  parcel_use: string | null
  apn: string | null
  structure_year_built: number | null
  total_parcel_value: Numeric
  notes: string | null
  created_at: string | null
  updated_at: string | null
  leads_count: number
  stakeholders: StakeholderDetail[]
  estimate: Estimate | null
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

export const estimatesApi = {
  /** Create an estimate for a property (one Solar lookup, EUI auto-fill). */
  async create(propertyId: string, input: EstimateInput): Promise<Estimate> {
    const response = await fetch(
      config.api.endpoints.properties.estimate(propertyId),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    )
    return parseJson<Estimate>(response)
  },

  /** Recalculate an existing estimate with new inputs (no Solar call). */
  async update(estimateId: number, input: EstimateInput): Promise<Estimate> {
    const response = await fetch(
      config.api.endpoints.estimates.byId(String(estimateId)),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    )
    return parseJson<Estimate>(response)
  },
}
