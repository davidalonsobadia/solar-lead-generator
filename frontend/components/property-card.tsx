import Image from "next/image"
import { Building2, MapPin, Users } from "lucide-react"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { PropertyListItem } from "@/features/properties/api"

/** Format a Decimal area (number or string) as a rounded ft² value. */
function formatArea(value: number | string | null): string {
  if (value === null || value === undefined || value === "") {
    return "—"
  }
  const num = typeof value === "string" ? Number(value) : value
  if (Number.isNaN(num)) {
    return "—"
  }
  return `${Math.round(num).toLocaleString()} ft²`
}

interface PropertyCardProps {
  property: PropertyListItem
}

/**
 * A single property tile for the Results grid: a thumbnail, the owner company,
 * its industry, the city, the reachable leads count, the key area metrics, and
 * a badge showing whether a solar estimate already exists.
 */
export function PropertyCard({ property }: PropertyCardProps) {
  const company = property.owner_company_name || "Unknown company"

  return (
    <Card className="overflow-hidden pt-0">
      <div className="relative aspect-video w-full bg-muted">
        <Image
          src="/placeholder.jpg"
          alt={`${company} property`}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover"
        />
        <Badge
          variant={property.has_estimate ? "default" : "secondary"}
          className="absolute right-3 top-3"
        >
          {property.has_estimate ? "Estimated" : "Not estimated"}
        </Badge>
      </div>

      <CardHeader>
        <CardTitle className="truncate" title={company}>
          {company}
        </CardTitle>
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          {property.industry && (
            <span className="flex items-center gap-1.5">
              <Building2 className="size-4 shrink-0" />
              <span className="truncate">{property.industry}</span>
            </span>
          )}
          {property.city && (
            <span className="flex items-center gap-1.5">
              <MapPin className="size-4 shrink-0" />
              <span className="truncate">{property.city}</span>
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Users className="size-4 shrink-0" />
            {property.leads} {property.leads === 1 ? "lead" : "leads"}
          </span>
        </div>
      </CardHeader>

      <CardContent>
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md border p-2">
            <dt className="text-xs text-muted-foreground">Rooftop</dt>
            <dd className="text-sm font-medium">
              {formatArea(property.solar_rooftop_area)}
            </dd>
          </div>
          <div className="rounded-md border p-2">
            <dt className="text-xs text-muted-foreground">Building</dt>
            <dd className="text-sm font-medium">
              {formatArea(property.building_area)}
            </dd>
          </div>
          <div className="rounded-md border p-2">
            <dt className="text-xs text-muted-foreground">Parcel</dt>
            <dd className="text-sm font-medium">
              {formatArea(property.parcel_area)}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  )
}
