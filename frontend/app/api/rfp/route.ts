import { type NextRequest, NextResponse } from "next/server"
import { apiFetch, ApiError } from "@/lib/api-client"
import { config } from "@/lib/config"

// Proxy `POST /api/v1/rfp` server-side (apiFetch injects x-api-key).
export async function POST(request: NextRequest) {
  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  try {
    const data = await apiFetch(config.api.endpoints.backend.rfp.base, {
      method: "POST",
      body: JSON.stringify(body),
      includeAuth: true,
    })

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error("[Sunscout] RFP create error:", error)

    if (error instanceof ApiError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      )
    }

    return NextResponse.json(
      { message: "Failed to create RFP" },
      { status: 500 },
    )
  }
}
