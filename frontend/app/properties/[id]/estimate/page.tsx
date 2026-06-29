import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { apiFetch, ApiError } from "@/lib/api-client"
import { config } from "@/lib/config"
import { Button } from "@/components/ui/button"
import { InputsPanel } from "@/components/estimate/inputs-panel"
import type { PropertyDetail } from "@/features/estimates/api"

interface EstimatePageProps {
  params: Promise<{ id: string }>
}

/**
 * Estimate screen (FE-06): the input panel precharged from the property detail.
 *
 * The property is fetched server-side (so the `x-api-key` and auth headers stay
 * off the client) and handed to the client `InputsPanel`, which debounce-
 * autosaves to create/recalculate the estimate. The Results panel (FE-07) and
 * sliders (FE-08) are separate, later screens.
 */
export default async function EstimatePage({ params }: EstimatePageProps) {
  const { id } = await params

  let property: PropertyDetail
  try {
    property = await apiFetch<PropertyDetail>(
      config.api.endpoints.backend.properties.byId(id),
      { method: "GET", includeAuth: true },
    )
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound()
    }
    throw error
  }

  const company =
    property.stakeholders.find((s) => s.role === "owner")?.company.name ??
    property.address ??
    `Property #${property.id}`

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6 space-y-4">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href={config.routes.results}>
              <ArrowLeft className="size-4" />
              Back to results
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">Estimate</h1>
            <p className="text-sm text-muted-foreground">{company}</p>
          </div>
        </div>

        <InputsPanel property={property} />
      </main>
    </div>
  )
}
