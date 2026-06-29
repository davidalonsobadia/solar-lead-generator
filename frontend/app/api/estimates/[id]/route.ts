import { type NextRequest, NextResponse } from "next/server"
import { apiFetch, ApiError } from "@/lib/api-client"
import { config } from "@/lib/config"

/**
 * Proxy an estimate recalculation to the backend.
 *
 * Forwards `PUT /api/v1/estimates/{id}` server-side via `apiFetch`, which
 * injects the `x-api-key` header and the caller's auth token, and returns the
 * updated `EstimateRead`. The backend reruns the engine over the persisted
 * inputs and the cached Solar response — it never calls the Solar API again.
 */
export async function PUT(
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
    const data = await apiFetch(config.api.endpoints.backend.estimates.byId(id), {
      method: "PUT",
      body: JSON.stringify(body),
      includeAuth: true,
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error("[Sunscout] Estimate update error:", error)

    if (error instanceof ApiError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      )
    }

    return NextResponse.json(
      { message: "Failed to update estimate" },
      { status: 500 },
    )
  }
}
