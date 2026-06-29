import { type NextRequest, NextResponse } from "next/server"
import { apiFetch, ApiError } from "@/lib/api-client"
import { config } from "@/lib/config"

// Proxy `GET /api/v1/properties/{id}/leads/export` (BE-04) server-side, where
// apiFetch injects x-api-key. The incoming query string (filters) is forwarded
// verbatim so the export honors the same filters as the on-screen list. The
// backend returns text/csv, which apiFetch surfaces as a string; we re-attach
// the attachment headers so the browser downloads it as a file.
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
    const endpoint = `${config.api.endpoints.backend.properties.leadsExport(id)}${query}`

    const csv = await apiFetch<string>(endpoint, {
      method: "GET",
      includeAuth: true,
    })

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="property-${id}-leads.csv"`,
      },
    })
  } catch (error) {
    console.error("[Sunscout] Property leads export error:", error)

    if (error instanceof ApiError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      )
    }

    return NextResponse.json(
      { message: "Failed to export leads" },
      { status: 500 },
    )
  }
}
