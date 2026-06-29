"use client"

import { useEffect, useRef, useState } from "react"
import { Leaf, TrendingUp } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { config } from "@/lib/config"
import { loadGoogleMaps } from "@/lib/google-maps"
import { cn } from "@/lib/utils"
import type { Estimate, PropertyDetail } from "@/features/estimates/api"

// Decimal columns arrive as a JSON number or string; coerce defensively.
type Numeric = number | string | null

// Square feet of footprint per kW of installed PV (commercial rule of thumb).
// Used only to size the illustrative footprint overlay on the map.
const FT2_PER_KW = 100

// Approximate metres per degree of latitude; longitude is scaled by cos(lat).
const METERS_PER_DEGREE_LAT = 111_320

// One square foot in square metres.
const SQFT_TO_SQM = 0.092903

/** A qualitative tier used to color a metric. */
type Tier = "good" | "fair" | "poor" | "neutral"

const TIER_TEXT: Record<Tier, string> = {
  good: "text-emerald-600 dark:text-emerald-400",
  fair: "text-amber-600 dark:text-amber-400",
  poor: "text-red-600 dark:text-red-400",
  neutral: "text-foreground",
}

/** Coerce a backend numeric (number or string) to a finite number, or null. */
function toNum(value: Numeric): number | null {
  if (value === null || value === undefined || value === "") {
    return null
  }
  const num = typeof value === "string" ? Number(value) : value
  return Number.isFinite(num) ? num : null
}

/** Format a number as whole US dollars (e.g. "$12,340"). */
function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  })
}

/** A single economics metric, prepared for display. */
interface Metric {
  key: string
  label: string
  value: string
  tier: Tier
}

/** Build the six economics metrics (with tiers) from an estimate's outputs. */
function buildMetrics(estimate: Estimate): Metric[] {
  const annual = toNum(estimate.annual_savings)
  const lifetime = toNum(estimate.savings_20yr)
  const irr = toNum(estimate.irr)
  const npv = toNum(estimate.npv)
  const payback = toNum(estimate.simple_payback_years)
  const co2 = toNum(estimate.co2_offset_20yr)

  const savingsTier = (v: number | null): Tier =>
    v === null ? "neutral" : v > 0 ? "good" : v < 0 ? "poor" : "fair"

  return [
    {
      key: "annual_savings",
      label: "Annual Savings",
      value: annual === null ? "—" : formatCurrency(annual),
      tier: savingsTier(annual),
    },
    {
      key: "savings_20yr",
      label: "20-Yr Savings",
      value: lifetime === null ? "—" : formatCurrency(lifetime),
      tier: savingsTier(lifetime),
    },
    {
      key: "irr",
      label: "IRR",
      // The engine returns a fraction; render it as a percentage.
      value: irr === null ? "—" : `${(irr * 100).toFixed(1)}%`,
      tier:
        irr === null ? "neutral" : irr >= 0.12 ? "good" : irr >= 0.06 ? "fair" : "poor",
    },
    {
      key: "npv",
      label: "NPV",
      value: npv === null ? "—" : formatCurrency(npv),
      tier: savingsTier(npv),
    },
    {
      key: "simple_payback",
      label: "Simple Payback",
      // A null payback means the investment is never recovered.
      value: payback === null ? "Never" : `${payback.toFixed(1)} yr`,
      tier:
        payback === null ? "poor" : payback <= 7 ? "good" : payback <= 12 ? "fair" : "poor",
    },
    {
      key: "co2_offset",
      label: "CO₂ Offset (20 yr)",
      // The engine stores kilograms; tonnes read better over a 20-year horizon.
      value: co2 === null ? "—" : `${(co2 / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })} t`,
      tier: co2 !== null && co2 > 0 ? "good" : "neutral",
    },
  ]
}

interface ResultsPanelProps {
  property: PropertyDetail
}

/**
 * Project Economics panel: the six headline metrics (tier-colored) plus a
 * satellite map showing the parcel boundary and an illustrative system
 * footprint. Falls back to a clear empty state when there is no solar data.
 */
export function ResultsPanel({ property }: ResultsPanelProps) {
  const estimate = property.estimate
  const production = estimate ? toNum(estimate.annual_production_kwh) : null
  // "No solar data" means no estimate yet, or an estimate that yields no
  // production (Google Solar found no rooftop and no system size was given).
  const hasEconomics = Boolean(estimate) && production !== null && production > 0

  const metrics = hasEconomics ? buildMetrics(estimate as Estimate) : []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="size-5 text-muted-foreground" />
          Project Economics
        </CardTitle>
        <CardDescription>
          Savings, return and emissions for the current estimate.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {hasEconomics ? (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {metrics.map((metric) => (
              <div key={metric.key} className="rounded-lg border p-3">
                <dt className="text-xs text-muted-foreground">{metric.label}</dt>
                <dd className={cn("mt-1 text-lg font-semibold", TIER_TEXT[metric.tier])}>
                  {metric.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <NoSolarData hasEstimate={Boolean(estimate)} />
        )}

        <ParcelMap
          lat={toNum(property.lat)}
          lon={toNum(property.lon)}
          parcelAreaFt2={toNum(property.parcel_area)}
          rooftopAreaFt2={toNum(property.solar_rooftop_area)}
          systemSizeKw={estimate ? toNum(estimate.system_size_kw) : null}
        />
      </CardContent>
    </Card>
  )
}

/** Empty state shown when no economics can be computed for the property. */
function NoSolarData({ hasEstimate }: { hasEstimate: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/30 p-6 text-center">
      <Leaf className="size-6 text-muted-foreground" />
      <p className="text-sm font-medium">No solar data available</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        {hasEstimate
          ? "We couldn't model a system for this property — no rooftop solar data was found and no system size is set. Enter a system size in the inputs to compute economics."
          : "No estimate has been calculated yet. Adjust the inputs to generate the project economics."}
      </p>
    </div>
  )
}

/** Build square map bounds of `areaFt2`, centered on (lat, lon). */
function boundsForArea(
  lat: number,
  lon: number,
  areaFt2: number,
): google.maps.LatLngBoundsLiteral {
  const sideMeters = Math.sqrt(areaFt2 * SQFT_TO_SQM)
  const half = sideMeters / 2
  const dLat = half / METERS_PER_DEGREE_LAT
  // Guard against the cos() term collapsing to zero near the poles.
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 1e-6)
  const dLon = half / (METERS_PER_DEGREE_LAT * cosLat)
  return {
    north: lat + dLat,
    south: lat - dLat,
    east: lon + dLon,
    west: lon - dLon,
  }
}

interface ParcelMapProps {
  lat: number | null
  lon: number | null
  parcelAreaFt2: number | null
  rooftopAreaFt2: number | null
  systemSizeKw: number | null
}

/**
 * Satellite map centered on the property. Draws the parcel boundary (when the
 * parcel area is known) and an illustrative footprint sized to the system
 * (from the system size, or the rooftop area as a fallback).
 */
function ParcelMap({
  lat,
  lon,
  parcelAreaFt2,
  rooftopAreaFt2,
  systemSizeKw,
}: ParcelMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const apiKey = config.googleMaps.apiKey

  const hasLocation = lat !== null && lon !== null
  // Prefer a footprint sized to the system; fall back to the measured rooftop.
  const footprintFt2 =
    systemSizeKw !== null && systemSizeKw > 0
      ? systemSizeKw * FT2_PER_KW
      : rooftopAreaFt2 !== null && rooftopAreaFt2 > 0
        ? rooftopAreaFt2
        : null

  useEffect(() => {
    if (!hasLocation || lat === null || lon === null) {
      return
    }
    if (!apiKey) {
      setError("Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to display the map.")
      return
    }

    let cancelled = false

    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !containerRef.current || !window.google?.maps) {
          return
        }

        const map = new window.google.maps.Map(containerRef.current, {
          center: { lat, lng: lon },
          zoom: 20,
          mapTypeId: "satellite",
          disableDefaultUI: true,
          zoomControl: true,
        })

        // Parcel boundary (outline only) when we know its area.
        if (parcelAreaFt2 !== null && parcelAreaFt2 > 0) {
          const parcelBounds = boundsForArea(lat, lon, parcelAreaFt2)
          new window.google.maps.Rectangle({
            bounds: parcelBounds,
            map,
            clickable: false,
            strokeColor: "#fbbf24",
            strokeOpacity: 0.9,
            strokeWeight: 2,
            fillOpacity: 0,
            zIndex: 1,
          })
          map.fitBounds(parcelBounds, 24)
        }

        // System footprint (filled) sized to the system or the rooftop.
        if (footprintFt2 !== null) {
          new window.google.maps.Rectangle({
            bounds: boundsForArea(lat, lon, footprintFt2),
            map,
            clickable: false,
            strokeColor: "#38bdf8",
            strokeOpacity: 0.9,
            strokeWeight: 2,
            fillColor: "#38bdf8",
            fillOpacity: 0.35,
            zIndex: 2,
          })
        }
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return
        }
        setError(err instanceof Error ? err.message : "Could not load the map.")
      })

    return () => {
      cancelled = true
    }
  }, [apiKey, hasLocation, lat, lon, parcelAreaFt2, footprintFt2])

  if (!hasLocation) {
    return (
      <div className="flex h-48 w-full items-center justify-center rounded-lg border bg-muted p-6 text-center text-sm text-muted-foreground">
        Location unavailable for this property.
      </div>
    )
  }

  return (
    <div className="relative h-72 w-full overflow-hidden rounded-lg border">
      {error ? (
        <div className="flex h-full w-full items-center justify-center bg-muted p-6 text-center text-sm text-muted-foreground">
          {error}
        </div>
      ) : (
        <div ref={containerRef} className="h-full w-full" data-testid="parcel-map" />
      )}

      {!error && (
        <div className="pointer-events-none absolute bottom-3 left-3 space-y-1 rounded-md bg-background/90 px-3 py-2 text-xs shadow-sm ring-1 ring-border">
          {parcelAreaFt2 !== null && parcelAreaFt2 > 0 && (
            <div className="flex items-center gap-2">
              <span className="inline-block size-3 rounded-sm border-2 border-amber-400" />
              Parcel boundary
            </div>
          )}
          {footprintFt2 !== null && (
            <div className="flex items-center gap-2">
              <span className="inline-block size-3 rounded-sm border-2 border-sky-400 bg-sky-400/40" />
              System footprint
            </div>
          )}
        </div>
      )}
    </div>
  )
}
