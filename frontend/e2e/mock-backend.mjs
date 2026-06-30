// Minimal stand-in for the FastAPI backend, used only by the Playwright E2E
// suite. It speaks just enough of the v1 contract to drive the
// Results -> Estimate -> Leads happy path, and it keeps the Google Solar lookup
// fully mocked: the estimate "creation" endpoint returns canned figures instead
// of calling any external service, so CI never reaches the real Solar API.
//
// The Next.js server (route handlers and server components) talks to this
// process via NEXT_PUBLIC_API_URL, so both the proxied client calls and the
// server-side `apiFetch` calls land here.
import { createServer } from "node:http"

const PORT = Number(process.env.MOCK_BACKEND_PORT ?? 8000)
const HOST = process.env.MOCK_BACKEND_HOST ?? "127.0.0.1"

const PROPERTY_ID = 1

// A single property used across the whole flow.
const property = {
  id: PROPERTY_ID,
  external_id: "EXT-0001",
  address: "100 Solar Way, Phoenix, AZ",
  lat: 33.4484,
  lon: -112.074,
  solar_rooftop_area: 12000,
  building_area: 10000,
  parcel_area: 20000,
  stories: 2,
  zoning: "Industrial",
  parcel_use: "Manufacturing",
  apn: "APN-12345",
  structure_year_built: 1998,
  total_parcel_value: 2500000,
  notes: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  stakeholders: [
    {
      id: 1,
      role: "owner",
      company: {
        id: 10,
        name: "Acme Manufacturing",
        website: "https://acme.example",
        business_industry: "Manufacturing",
        annual_revenue: 50000000,
      },
    },
  ],
  // Populated by POST /properties/{id}/estimate (the mocked Solar lookup).
  estimate: null,
}

// Stateful so the flow mirrors the real UI: the estimate page first renders with
// no estimate (which triggers the create call), and after reloading the slider
// panel becomes editable.
let estimate = null

/** Build a fully-populated estimate, merging any caller-supplied inputs. */
function buildEstimate(input = {}) {
  const merged = {
    id: 1,
    property_id: PROPERTY_ID,
    system_size_kw: input.system_size_kw ?? 120,
    price_per_watt: input.price_per_watt ?? 3.0,
    system_losses_pct: input.system_losses_pct ?? 14,
    shading_pct: input.shading_pct ?? 0,
    annual_consumption_kwh: input.annual_consumption_kwh ?? 180000,
    blended_utility_rate: input.blended_utility_rate ?? 0.2,
    rate_escalation_pct: input.rate_escalation_pct ?? 2.5,
    include_bess: input.include_bess ?? false,
    incentives: input.incentives ?? [],
    annual_production_kwh: 190000,
    system_cost: 360000,
    net_cost: 252000,
    annual_savings: 38000,
    savings_20yr: 760000,
    irr: 0.14,
    npv: 410000,
    simple_payback_years: 6.6,
    co2_offset_20yr: 2700,
    status: "complete",
    created_at: "2026-01-02T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  }
  return merged
}

const listItem = {
  id: PROPERTY_ID,
  external_id: property.external_id,
  address: property.address,
  city: "Phoenix",
  industry: "Manufacturing",
  owner_company_id: 10,
  owner_company_name: "Acme Manufacturing",
  solar_rooftop_area: property.solar_rooftop_area,
  building_area: property.building_area,
  parcel_area: property.parcel_area,
  leads: 2,
  get has_estimate() {
    return estimate !== null
  },
}

const leads = [
  {
    id: 101,
    name: "Jordan Rivera",
    job_title: "Facilities Director",
    email: "jordan@acme.example",
    phone: "+1-602-555-0101",
    linkedin: "https://www.linkedin.com/in/jordanrivera",
    lead_location: "Phoenix, AZ",
    role: "owner",
    company: {
      id: 10,
      name: "Acme Manufacturing",
      website: "https://acme.example",
      business_industry: "Manufacturing",
      annual_revenue: 50000000,
    },
    created_at: "2026-01-03T00:00:00Z",
  },
  {
    id: 102,
    name: "Sam Okafor",
    job_title: "VP Operations",
    email: "sam@acme.example",
    phone: "+1-602-555-0102",
    linkedin: "https://www.linkedin.com/in/samokafor",
    lead_location: "Phoenix, AZ",
    role: "owner",
    company: {
      id: 10,
      name: "Acme Manufacturing",
      website: "https://acme.example",
      business_industry: "Manufacturing",
      annual_revenue: 50000000,
    },
    created_at: "2026-01-03T00:00:00Z",
  },
]

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  })
  res.end(body)
}

function leadsCsv() {
  const header = "id,name,job_title,email,phone,role,company"
  const rows = leads.map(
    (l) =>
      `${l.id},${l.name},${l.job_title},${l.email},${l.phone},${l.role},${l.company.name}`,
  )
  return [header, ...rows].join("\n") + "\n"
}

async function readJsonBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  if (chunks.length === 0) {
    return {}
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    return {}
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const path = url.pathname
  const method = req.method ?? "GET"

  // Properties list.
  if (path === "/api/v1/properties" && method === "GET") {
    return sendJson(res, 200, {
      items: [listItem],
      total: 1,
      page: 1,
      page_size: 12,
      total_pages: 1,
    })
  }

  // Property detail (drives the estimate and leads page headers).
  if (path === `/api/v1/properties/${PROPERTY_ID}` && method === "GET") {
    return sendJson(res, 200, { ...property, estimate })
  }

  // Create estimate (the mocked Google Solar lookup happens here).
  if (
    path === `/api/v1/properties/${PROPERTY_ID}/estimate` &&
    method === "POST"
  ) {
    const input = await readJsonBody(req)
    estimate = buildEstimate(input)
    return sendJson(res, 201, estimate)
  }

  // Recalculate an existing estimate (no Solar lookup).
  if (path === "/api/v1/estimates/1" && method === "PUT") {
    const input = await readJsonBody(req)
    estimate = buildEstimate({ ...estimate, ...input })
    return sendJson(res, 200, estimate)
  }

  // Leads CSV export. Must precede the leads list match below.
  if (
    path === `/api/v1/properties/${PROPERTY_ID}/leads/export` &&
    method === "GET"
  ) {
    const csv = leadsCsv()
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Length": Buffer.byteLength(csv),
    })
    return res.end(csv)
  }

  // Leads list.
  if (
    path === `/api/v1/properties/${PROPERTY_ID}/leads` &&
    method === "GET"
  ) {
    return sendJson(res, 200, {
      items: leads,
      total: leads.length,
      page: 1,
      page_size: 25,
      total_pages: 1,
    })
  }

  // Health check / anything else.
  if (path === "/api/v1/health") {
    return sendJson(res, 200, { status: "ok" })
  }

  sendJson(res, 404, { detail: "Not found", path })
})

server.listen(PORT, HOST, () => {
  console.log(`[mock-backend] listening on http://${HOST}:${PORT}`)
})
