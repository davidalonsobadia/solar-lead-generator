import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { apiFetch, ApiError } from "@/lib/api-client"
import { config } from "@/lib/config"
import { Button } from "@/components/ui/button"
import { InputsPanel } from "@/components/estimate/inputs-panel"
import { AdjustSliders } from "@/components/estimate/adjust-sliders"
import type { PropertyDetail } from "@/features/estimates/api"

interface EstimatePageProps {
  params: Promise<{ id: string }>
}

// Estimate screen: fetch the property server-side and hand it to InputsPanel.
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

        <div className="space-y-6">
          <InputsPanel property={property} />
          <AdjustSliders property={property} />
        </div>
      </main>
    </div>
  )
}
