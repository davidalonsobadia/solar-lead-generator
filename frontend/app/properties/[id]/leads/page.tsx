import { notFound } from "next/navigation"

import { apiFetch, ApiError } from "@/lib/api-client"
import { config } from "@/lib/config"
import { LeadsShell } from "@/components/leads/leads-shell"
import type { PropertyDetail } from "@/features/estimates/api"

interface LeadsPageProps {
  params: Promise<{ id: string }>
}

export default async function LeadsPage({ params }: LeadsPageProps) {
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

  return <LeadsShell property={property} />
}
