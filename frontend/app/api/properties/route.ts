import { type NextRequest, NextResponse } from "next/server"
import { apiFetch, ApiError } from "@/lib/api-client"
import { config } from "@/lib/config"

/**
 * Proxy the properties list to the backend catalogue endpoint.
 *
 * Forwards the request server-side via `apiFetch`, which injects the
 * `x-api-key` header and the caller's auth token, and returns the backend
 * `PropertyListResponse` envelope. Any incoming query string (filters, sort,
 * paging) is passed through verbatim so later UI work can use it without
 * touching this handler.
 */
export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.search
    const endpoint = `${config.api.endpoints.backend.properties.base}${query}`

    const data = await apiFetch(endpoint, {
      method: "GET",
      includeAuth: true,
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error("[Sunscout] Properties list error:", error)

    if (error instanceof ApiError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      )
    }

    return NextResponse.json(
      { message: "Failed to load properties" },
      { status: 500 },
    )
  }
}
