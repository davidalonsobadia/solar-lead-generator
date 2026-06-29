import { type NextRequest, NextResponse } from "next/server"
import { apiFetch, ApiError } from "@/lib/api-client"
import { config } from "@/lib/config"

// Proxy `GET /api/v1/properties/{id}` server-side (apiFetch injects x-api-key).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  if (Number.isNaN(parseInt(id, 10))) {
    return NextResponse.json({ message: "Invalid property id" }, { status: 400 })
  }

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
