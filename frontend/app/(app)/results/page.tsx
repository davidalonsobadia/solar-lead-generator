"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  SlidersHorizontal,
} from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import { PropertyCard } from "@/components/property-card"
import { config } from "@/lib/config"
import {
  propertiesApi,
  type PropertyListItem,
  type PropertySortBy,
  type SortOrder,
} from "@/features/properties/api"

const PAGE_SIZE = 12

const SORT_OPTIONS: { value: PropertySortBy; label: string }[] = [
  { value: "rooftop_area", label: "Rooftop Area" },
  { value: "building_area", label: "Building Area" },
  { value: "leads", label: "Leads" },
  { value: "company_name", label: "Company Name" },
]

export default function ResultsPage() {
  return (
    <Suspense fallback={<ResultsSkeleton />}>
      <ResultsContent />
    </Suspense>
  )
}

function ResultsContent() {
  const searchParams = useSearchParams()

  const industriesParam = searchParams.get("industries") ?? ""
  const locationParam = searchParams.get("location") ?? ""

  const industries = industriesParam
    ? industriesParam.split(",").map((s) => s.trim()).filter(Boolean)
    : []

  // Backend supports a single exact-match industry filter.
  // With multiple industries selected, skip the filter and show all results.
  const industryFilter = industries.length === 1 ? industries[0] : undefined
  const cityFilter = locationParam || undefined

  const [items, setItems] = useState<PropertyListItem[]>([])
  const [sortBy, setSortBy] = useState<PropertySortBy>("rooftop_area")
  const [order, setOrder] = useState<SortOrder>("desc")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [sortOpen, setSortOpen] = useState(false)

  useEffect(() => {
    setPage(1)
    setItems([])
  }, [sortBy, order])

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError("")
      try {
        const data = await propertiesApi.list({
          industry: industryFilter,
          city: cityFilter,
          sortBy,
          order,
          page,
          pageSize: PAGE_SIZE,
        })
        if (!active) return
        setItems((prev) => (page === 1 ? data.items : [...prev, ...data.items]))
        setTotalPages(data.total_pages)
        setTotal(data.total)
      } catch (err) {
        if (active)
          setError(err instanceof Error ? err.message : "Failed to load properties.")
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [industryFilter, cityFilter, sortBy, order, page])

  const hasMore = page < totalPages
  const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? "Rooftop Area"

  const breadcrumbSuffix = [locationParam, industriesParam].filter(Boolean).join(" · ")

  return (
    <div className="space-y-6">
      {/* Back breadcrumb + header */}
      <div>
        <Link
          href={config.routes.findLeads}
          className="inline-flex items-center gap-1.5 text-sm text-[#5F7378] hover:text-[#0D4E5E] transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Find Rooftops</span>
          {breadcrumbSuffix && (
            <>
              <span className="text-[#C4D0D4]">/</span>
              <span className="text-[#102830]">{breadcrumbSuffix}</span>
            </>
          )}
        </Link>

        <h1
          className="text-[38px] font-bold text-[#102830] leading-tight"
          style={{ fontFamily: "var(--font-inter-tight, 'Inter Tight', sans-serif)" }}
        >
          {!loading || total > 0 ? (
            <span className="text-[#0D4E5E]">{total.toLocaleString()}</span>
          ) : (
            <span className="inline-block w-16 h-9 bg-[#EAEFF0] rounded animate-pulse align-middle" />
          )}{" "}
          Rooftops Found
        </h1>
        <p className="mt-1.5 text-[15px] text-[#5F7378]">
          C&I rooftops matching your search. Generate an estimate to see solar
          potential &amp; lead detail.
        </p>
      </div>

      {/* Filter bar */}
      <div
        className="bg-white rounded-2xl px-5 py-3.5 flex flex-wrap items-center gap-2.5"
        style={{
          border: "1px solid #EAEFF0",
          boxShadow: "0 1px 2px rgba(16,42,48,0.04)",
        }}
      >
        <span className="flex items-center gap-1.5 text-sm font-medium text-[#5F7378] mr-1">
          <SlidersHorizontal className="h-4 w-4" />
          Filters
        </span>

        <FilterPill
          label="Business Industry"
          value={
            industries.length === 0
              ? "Any"
              : industries.length === 1
              ? industries[0]
              : `${industries.length} selected`
          }
        />
        <FilterPill label="City / State" value={locationParam || "Any"} />
        <FilterPill label="Rooftop Area" value="Any" />
        <FilterPill label="Building Area" value="Any" />
        <FilterPill label="Status" value="All" />

        {/* Sort controls */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-[#5F7378] hidden sm:inline">Sort by</span>
          <div className="relative">
            <button
              onClick={() => setSortOpen((v) => !v)}
              className="flex items-center gap-1.5 h-9 px-3 text-sm font-medium text-[#102830] rounded-lg hover:bg-[#EDF6F8] transition-colors"
              style={{ border: "1px solid #DCE4E6", background: "#F4F7F8" }}
            >
              {currentSortLabel}
              <ChevronDown className="h-3.5 w-3.5 text-[#5F7378]" />
            </button>
            {sortOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setSortOpen(false)}
                />
                <div
                  className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl py-1.5 z-20"
                  style={{
                    border: "1px solid #EAEFF0",
                    boxShadow: "0 8px 24px rgba(16,42,48,0.12)",
                  }}
                >
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setSortBy(opt.value)
                        setSortOpen(false)
                      }}
                      className={[
                        "w-full text-left px-3 py-2 text-sm hover:bg-[#F4F7F8] transition-colors",
                        opt.value === sortBy
                          ? "text-[#0D4E5E] font-semibold"
                          : "text-[#102830]",
                      ].join(" ")}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => setOrder((o) => (o === "asc" ? "desc" : "asc"))}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-[#5F7378] hover:bg-[#EDF6F8] transition-colors"
            style={{ border: "1px solid #DCE4E6", background: "#F4F7F8" }}
            title={order === "asc" ? "Ascending" : "Descending"}
            aria-label={`Sort ${order === "asc" ? "ascending" : "descending"}`}
          >
            {order === "asc" ? (
              <ArrowUp className="h-4 w-4" />
            ) : (
              <ArrowDown className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Card grid */}
      {loading && page === 1 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[460px] w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-16 text-[#5F7378]">{error}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-[#5F7378]">
          No rooftops found. Try adjusting your search.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>

          <div className="flex flex-col items-center gap-2 pt-2">
            <p className="text-sm text-[#5F7378]">
              Showing {items.length} of {total}
            </p>
            {hasMore && !loading && (
              <button
                onClick={() => setPage((p) => p + 1)}
                className="px-6 h-10 text-sm font-medium text-[#0D4E5E] rounded-[10px] transition-colors hover:bg-[#EDF6F8]"
                style={{ border: "1.5px solid #C5DEE4" }}
              >
                Load more
              </button>
            )}
            {loading && page > 1 && (
              <p className="text-sm text-[#5F7378]">Loading more…</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function FilterPill({ label, value }: { label: string; value: string }) {
  return (
    <button
      className="flex items-center gap-1.5 h-9 px-3 text-sm rounded-lg hover:bg-[#EDF6F8] transition-colors"
      style={{ border: "1px solid #DCE4E6", background: "white" }}
    >
      <span className="text-[#5F7378] font-medium">{label}:</span>
      <span className="font-semibold text-[#102830]">{value}</span>
      <ChevronDown className="h-3.5 w-3.5 text-[#5F7378]" />
    </button>
  )
}

function ResultsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Skeleton className="h-14 w-full rounded-2xl" />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[460px] w-full rounded-2xl" />
        ))}
      </div>
    </div>
  )
}
