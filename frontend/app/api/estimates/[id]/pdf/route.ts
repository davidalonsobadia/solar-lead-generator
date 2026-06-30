import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { ApiError } from "@/lib/api-client"
import { config } from "@/lib/config"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || "some-api-key"

// Proxy `GET /api/v1/estimates/{id}/pdf` server-side, streaming the PDF bytes.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  if (Number.isNaN(parseInt(id, 10))) {
    return NextResponse.json({ message: "Invalid estimate id" }, { status: 400 })
  }

  const backendUrl = `${API_BASE_URL}${config.api.endpoints.backend.estimates.byId(id)}/pdf`

  const headers: Record<string, string> = {
    "x-api-key": API_KEY,
  }

  const cookieStore = await cookies()
  const token = cookieStore.get("auth-token")?.value
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  try {
    const response = await fetch(backendUrl, { method: "GET", headers })

    if (!response.ok) {
      let msg = `HTTP ${response.status}`
      try {
        const body = await response.json()
        msg = body?.detail || body?.message || msg
      } catch {
        /* ignore */
      }
      throw new ApiError(msg, response.status)
    }

    const bytes = await response.arrayBuffer()
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="estimate-${id}.pdf"`,
      },
    })
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      )
    }
    return NextResponse.json(
      { message: "Failed to export PDF" },
      { status: 500 },
    )
  }
}
