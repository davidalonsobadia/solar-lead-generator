import { type NextRequest, NextResponse } from "next/server"
import { apiFetch, ApiError } from "@/lib/api-client"
import { config } from "@/lib/config"

// Proxy `GET /api/v1/properties/{id}/leads` server-side (apiFetch injects
// x-api-key). Any incoming query string (filters, paging) is forwarded
// verbatim so the client helper can drive the backend without touching this
// handler.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  if (Number.isNaN(parseInt(id, 10))) {
    return NextResponse.json({ message: "Invalid property id" }, { status: 400 })
  }

  try {
    const query = request.nextUrl.search
    const endpoint = `${config.api.endpoints.backend.properties.leads(id)}${query}`

    const data = await apiFetch(endpoint, { method: "GET", includeAuth: true })

    return NextResponse.json(data)
  } catch (error) {
    console.error("[Sunscout] Property leads error:", error)

    if (error instanceof ApiError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      )
    }

    return NextResponse.json(
      { message: "Failed to load leads" },
      { status: 500 },
    )
  }
}
