"use client"

import { useEffect, useState } from "react"
import { AlertCircle, Inbox } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { PropertyCard } from "@/components/property-card"
import { propertiesApi, type PropertyListItem } from "@/features/properties/api"

// Results (FE-04): a card grid of properties from GET /api/v1/properties.
// Filters, sort and pagination controls arrive in FE-05.
export default function ResultsPage() {
  const [items, setItems] = useState<PropertyListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError("")
      try {
        const data = await propertiesApi.list()
        if (active) {
          setItems(data.items)
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Failed to load properties.",
          )
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      active = false
    }
  }, [])

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold">Results</h1>
        <p className="mt-2 text-muted-foreground">
          Properties discovered for solar prospecting.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-80 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Could not load properties</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : items.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Inbox />
            </EmptyMedia>
            <EmptyTitle>No properties yet</EmptyTitle>
            <EmptyDescription>
              Import property data to start qualifying solar leads.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((property) => (
            <PropertyCard key={property.id} property={property} />
          ))}
        </div>
      )}
    </section>
  )
}
