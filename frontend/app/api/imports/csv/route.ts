import { type NextRequest, NextResponse } from "next/server"
import { apiFetch, ApiError } from "@/lib/api-client"
import { config } from "@/lib/config"

/**
 * Proxy a CSV upload to the backend import endpoint.
 *
 * The browser posts a `multipart/form-data` body with a single `file` field.
 * We forward it server-side via `apiFetch`, which injects the `x-api-key`
 * header and the caller's auth token, and return the backend import summary.
 */
export async function POST(request: NextRequest) {
  try {
    const incoming = await request.formData()
    const file = incoming.get("file")

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, message: "No CSV file was provided." },
        { status: 400 },
      )
    }

    const forwarded = new FormData()
    forwarded.append("file", file, file.name)

    const summary = await apiFetch(config.api.endpoints.backend.imports.csv, {
      method: "POST",
      body: forwarded,
      includeAuth: true,
    })

    return NextResponse.json({ success: true, summary })
  } catch (error) {
    console.error("[Sunscout] CSV import error:", error)

    if (error instanceof ApiError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status },
      )
    }

    return NextResponse.json(
      { success: false, message: "CSV import failed" },
      { status: 500 },
    )
  }
}
