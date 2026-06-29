"use client"

import { useEffect, useState } from "react"
import { AlertCircle, Inbox } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { PropertyCard } from "@/components/property-card"
import {
  ResultsToolbar,
  type ResultsFilters,
} from "@/components/results-toolbar"
import {
  propertiesApi,
  type PropertyListItem,
  type PropertySortBy,
  type SortOrder,
} from "@/features/properties/api"

const PAGE_SIZE = 12

// Results (FE-04/FE-05): a card grid of properties from GET /api/v1/properties
// with industry/location filters, 4-key sorting (asc/desc) and "Load more"
// pagination — all of which drive the API query.
export default function ResultsPage() {
  const [items, setItems] = useState<PropertyListItem[]>([])
  const [filters, setFilters] = useState<ResultsFilters>({
    industry: "",
    city: "",
  })
  const [sortBy, setSortBy] = useState<PropertySortBy>("rooftop_area")
  const [order, setOrder] = useState<SortOrder>("desc")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // Reset to the first page whenever the query (filters or sort) changes.
  useEffect(() => {
    setPage(1)
  }, [filters, sortBy, order])

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError("")
      try {
        const data = await propertiesApi.list({
          industry: filters.industry || undefined,
          city: filters.city || undefined,
          sortBy,
          order,
          page,
          pageSize: PAGE_SIZE,
        })
        if (!active) return
        // Append when loading a later page, replace when the query changed.
        setItems((prev) => (page === 1 ? data.items : [...prev, ...data.items]))
        setTotalPages(data.total_pages)
        setTotal(data.total)
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
  }, [filters, sortBy, order, page])

  const hasMore = page < totalPages

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold">Results</h1>
        <p className="mt-2 text-muted-foreground">
          Properties discovered for solar prospecting.
        </p>
      </div>

      <ResultsToolbar
        filters={filters}
        sortBy={sortBy}
        order={order}
        onApplyFilters={setFilters}
        onRemoveFilter={(key) =>
          setFilters((prev) => ({ ...prev, [key]: "" }))
        }
        onSortByChange={setSortBy}
        onOrderChange={setOrder}
      />

      {loading && page === 1 ? (
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
            <EmptyTitle>No properties found</EmptyTitle>
            <EmptyDescription>
              Try adjusting or clearing the filters above.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>

          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-muted-foreground">
              Showing {items.length} of {total}
            </p>
            {hasMore && (
              <Button
                variant="outline"
                disabled={loading}
                onClick={() => setPage((prev) => prev + 1)}
              >
                {loading ? "Loading…" : "Load more"}
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  )
}
