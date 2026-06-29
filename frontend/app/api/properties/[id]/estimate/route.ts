import { type NextRequest, NextResponse } from "next/server"
import { apiFetch, ApiError } from "@/lib/api-client"
import { config } from "@/lib/config"

// Proxy `POST /api/v1/properties/{id}/estimate` server-side (apiFetch injects x-api-key).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  if (Number.isNaN(parseInt(id, 10))) {
    return NextResponse.json({ message: "Invalid property id" }, { status: 400 })
  }

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
