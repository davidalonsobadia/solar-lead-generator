import { apiFetch, ApiError } from "@/lib/api-client"
import { config } from "@/lib/config"
import { RfpForm, type RfpFormDefaults } from "@/components/rfp/rfp-form"
import type { PropertyDetail } from "@/features/estimates/api"

interface RfpPageProps {
  searchParams: Promise<{ propertyId?: string }>
}

// RFP tab (FE-11): a basic form to open a conversation, persisted via
// POST /api/v1/rfp. When opened with ?propertyId=<id> it precharges the
// organization and address from that property.
export default async function RfpPage({ searchParams }: RfpPageProps) {
  const { propertyId } = await searchParams
  const parsedId = propertyId ? parseInt(propertyId, 10) : NaN

  let defaults: RfpFormDefaults | undefined
  if (!Number.isNaN(parsedId)) {
    try {
      const property = await apiFetch<PropertyDetail>(
        config.api.endpoints.backend.properties.byId(String(parsedId)),
        { method: "GET", includeAuth: true },
      )
      const owner = property.stakeholders.find((s) => s.role === "owner")
        ?.company
      defaults = {
        propertyId: property.id,
        organizationName: owner?.name ?? null,
        propertyAddress: property.address,
        contactCompany: owner?.name ?? null,
      }
    } catch (error) {
      // A bad/unknown id should not break the page — fall back to a blank form.
      if (!(error instanceof ApiError)) {
        throw error
      }
    }
  }

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-3xl font-bold">RFP</h1>
        <p className="mt-2 text-muted-foreground">
          Draft a request for proposal and persist it to open a conversation.
        </p>
      </div>

      <RfpForm defaults={defaults} />
    </section>
  )
}
