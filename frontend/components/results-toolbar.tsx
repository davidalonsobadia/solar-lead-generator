"use client"

import { useEffect, useState, type FormEvent } from "react"
import { ArrowDownAZ, ArrowUpAZ, Search, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { PropertySortBy, SortOrder } from "@/features/properties/api"

/** The filter values that drive the API query. */
export interface ResultsFilters {
  industry: string
  city: string
}

/** Human-readable labels for each sort key. */
const SORT_OPTIONS: { value: PropertySortBy; label: string }[] = [
  { value: "rooftop_area", label: "Rooftop area" },
  { value: "building_area", label: "Building area" },
  { value: "leads", label: "Leads" },
  { value: "company_name", label: "Company name" },
]

interface ResultsToolbarProps {
  filters: ResultsFilters
  sortBy: PropertySortBy
  order: SortOrder
  onApplyFilters: (filters: ResultsFilters) => void
  onRemoveFilter: (key: keyof ResultsFilters) => void
  onSortByChange: (sortBy: PropertySortBy) => void
  onOrderChange: (order: SortOrder) => void
}

/**
 * Filter, sort and ordering controls for the Results screen (FE-05).
 *
 * Filters are edited in local draft inputs and lifted to the parent only on
 * submit, so typing does not refetch on every keystroke. Active filters are
 * mirrored as removable chips. Sort key and direction apply immediately.
 */
export function ResultsToolbar({
  filters,
  sortBy,
  order,
  onApplyFilters,
  onRemoveFilter,
  onSortByChange,
  onOrderChange,
}: ResultsToolbarProps) {
  const [draft, setDraft] = useState<ResultsFilters>(filters)

  // Keep the draft in sync when filters are cleared from outside (e.g. chips).
  useEffect(() => {
    setDraft(filters)
  }, [filters])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onApplyFilters({
      industry: draft.industry.trim(),
      city: draft.city.trim(),
    })
  }

  const activeChips = (
    [
      { key: "industry", label: "Industry", value: filters.industry },
      { key: "city", label: "Location", value: filters.city },
    ] as const
  ).filter((chip) => chip.value)

  return (
    <div className="space-y-3">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="filter-industry">Industry</Label>
          <Input
            id="filter-industry"
            placeholder="e.g. Logistics"
            value={draft.industry}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, industry: event.target.value }))
            }
            className="sm:w-44"
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="filter-city">Location</Label>
          <Input
            id="filter-city"
            placeholder="e.g. San Diego"
            value={draft.city}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, city: event.target.value }))
            }
            className="sm:w-44"
          />
        </div>

        <Button type="submit" variant="secondary">
          <Search className="size-4" />
          Apply
        </Button>

        <div className="grid gap-1.5 sm:ml-auto">
          <Label htmlFor="sort-by">Sort by</Label>
          <Select
            value={sortBy}
            onValueChange={(value) => onSortByChange(value as PropertySortBy)}
          >
            <SelectTrigger id="sort-by" className="sm:w-44">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => onOrderChange(order === "asc" ? "desc" : "asc")}
          aria-label={
            order === "asc" ? "Sort ascending" : "Sort descending"
          }
          title={order === "asc" ? "Ascending" : "Descending"}
        >
          {order === "asc" ? (
            <ArrowUpAZ className="size-4" />
          ) : (
            <ArrowDownAZ className="size-4" />
          )}
          {order === "asc" ? "Asc" : "Desc"}
        </Button>
      </form>

      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeChips.map((chip) => (
            <Badge key={chip.key} variant="secondary" className="gap-1 pr-1">
              <span className="text-muted-foreground">{chip.label}:</span>
              {chip.value}
              <button
                type="button"
                onClick={() => onRemoveFilter(chip.key)}
                aria-label={`Remove ${chip.label} filter`}
                className="ml-0.5 rounded-sm hover:bg-muted-foreground/20"
              >
                <X className="size-3.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
