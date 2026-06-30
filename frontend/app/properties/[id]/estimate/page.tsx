import { notFound } from "next/navigation"

import { apiFetch, ApiError } from "@/lib/api-client"
import { config } from "@/lib/config"
import { EstimateShell } from "@/components/estimate/estimate-shell"
import type { PropertyDetail } from "@/features/estimates/api"

interface EstimatePageProps {
  params: Promise<{ id: string }>
}

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

  return <EstimateShell property={property} />
}
