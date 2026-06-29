import { type NextRequest, NextResponse } from "next/server"
import { apiFetch, ApiError } from "@/lib/api-client"
import { config } from "@/lib/config"

/**
 * Proxy an estimate creation to the backend.
 *
 * Forwards `POST /api/v1/properties/{id}/estimate` server-side via `apiFetch`,
 * which injects the `x-api-key` header and the caller's auth token, and returns
 * the created `EstimateRead`. The backend does at most one Google Solar lookup
 * per property and auto-fills consumption from the owner industry's EUI when no
 * manual value is supplied.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  try {
    const data = await apiFetch(
      config.api.endpoints.backend.properties.estimate(id),
      { method: "POST", body: JSON.stringify(body), includeAuth: true },
    )

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error("[Sunscout] Estimate create error:", error)

    if (error instanceof ApiError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      )
    }

    return NextResponse.json(
      { message: "Failed to create estimate" },
      { status: 500 },
    )
  }
}
