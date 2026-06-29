import { type NextRequest, NextResponse } from "next/server"
import { apiFetch, ApiError } from "@/lib/api-client"
import { config } from "@/lib/config"

// Proxy `PUT /api/v1/estimates/{id}` server-side (apiFetch injects x-api-key).
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  if (Number.isNaN(parseInt(id, 10))) {
    return NextResponse.json({ message: "Invalid estimate id" }, { status: 400 })
  }

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
