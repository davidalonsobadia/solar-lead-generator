"use client"

import { useEffect, useRef, useState } from "react"

import { config } from "@/lib/config"
import { loadGoogleMaps } from "@/lib/google-maps"
import { cn } from "@/lib/utils"

// Demo center for v1: Santa Clara, California. A high zoom on the satellite
// basemap shows individual building rooftops, which is what the lead-finding
// flow will eventually operate on. Search by area/industry/name is deferred
// (see the Find Leads page), so this view is intentionally fixed.
const DEMO_CENTER = { lat: 37.3541, lng: -121.9552 }
const DEMO_ZOOM = 19

/**
 * Read-only demo map for the Find Leads screen. Centers on a California point
 * with the satellite basemap so building rooftops are visible. There is no
 * functional search in v1.
 */
export function MapView({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const apiKey = config.googleMaps.apiKey

  useEffect(() => {
    if (!apiKey) {
      setError("Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to display the map.")
      return
    }

    let cancelled = false

    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !containerRef.current || !window.google?.maps) return
        new window.google.maps.Map(containerRef.current, {
          center: DEMO_CENTER,
          zoom: DEMO_ZOOM,
          mapTypeId: "satellite",
          disableDefaultUI: true,
          zoomControl: true,
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Could not load the map.")
      })

    return () => {
      cancelled = true
    }
  }, [apiKey])

  return (
    <div className={cn("relative h-[60vh] w-full overflow-hidden rounded-lg border", className)}>
      {error ? (
        <div className="flex h-full w-full items-center justify-center bg-muted p-6 text-center text-sm text-muted-foreground">
          {error}
        </div>
      ) : (
        <div ref={containerRef} className="h-full w-full" data-testid="map-container" />
      )}

      {/* Visible "demo view" note required by the v1 acceptance criteria. */}
      <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm ring-1 ring-border">
        Demo view — Santa Clara, California
      </div>
    </div>
  )
}
