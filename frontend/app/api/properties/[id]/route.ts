import { type NextRequest, NextResponse } from "next/server"
import { apiFetch, ApiError } from "@/lib/api-client"
import { config } from "@/lib/config"

/**
 * Proxy a single property detail to the backend.
 *
 * Forwards `GET /api/v1/properties/{id}` server-side via `apiFetch`, which
 * injects the `x-api-key` header and the caller's auth token, and returns the
 * backend `PropertyDetail` (its fields, stakeholders and latest estimate). This
 * powers the Estimate screen's input panel, which precharges from it.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  try {
    const data = await apiFetch(
      config.api.endpoints.backend.properties.byId(id),
      { method: "GET", includeAuth: true },
    )

    return NextResponse.json(data)
  } catch (error) {
    console.error("[Sunscout] Property detail error:", error)

    if (error instanceof ApiError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      )
    }

    return NextResponse.json(
      { message: "Failed to load property" },
      { status: 500 },
    )
  }
}
