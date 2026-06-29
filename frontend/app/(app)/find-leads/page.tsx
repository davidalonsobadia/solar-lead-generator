import { MapView } from "@/components/map-view"

// Find Leads (v1): a demonstration map centered on California showing building
// rooftops on the satellite basemap. There is NO functional search in v1 —
// search by area, industry, or name is deferred to a later iteration.
export default function FindLeadsPage() {
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold">Find Leads</h1>
        <p className="mt-2 text-muted-foreground">
          Demo view of solar prospects. Search by area, industry, or name is coming in a
          future release.
        </p>
      </div>

      <MapView />
    </section>
  )
}
