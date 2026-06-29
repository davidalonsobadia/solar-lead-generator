"use client"

import { useEffect, useState, type FormEvent } from "react"
import { CalendarPlus, Download, Search, X } from "lucide-react"

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

/** The lead filter values that drive the API query. */
export interface LeadFilters {
  jobTitle: string
  /** Stakeholder role: "" (any) | owner | property_manager | tenant. */
  role: string
  location: string
  q: string
}

/** An empty set of filters (no filtering). */
export const EMPTY_LEAD_FILTERS: LeadFilters = {
  jobTitle: "",
  role: "",
  location: "",
  q: "",
}

// Sentinel value for the role <Select>, because Radix Select items cannot use
// an empty string value. Mapped to "" (any role) at the boundary.
const ANY_ROLE = "all"

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: ANY_ROLE, label: "All roles" },
  { value: "owner", label: "Owner" },
  { value: "property_manager", label: "Property Manager" },
  { value: "tenant", label: "Tenant" },
]

function roleLabel(role: string): string {
  return ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role
}

interface LeadsToolbarProps {
  filters: LeadFilters
  selectedCount: number
  exporting: boolean
  onApplyFilters: (filters: LeadFilters) => void
  onRemoveFilter: (key: keyof LeadFilters) => void
  onExport: () => void
  onSetAppointments: () => void
}

/**
 * Filter, export and appointment controls for the Generate Leads screen
 * (FE-10).
 *
 * Filters (job title, role, location, free-text search) are edited in local
 * draft inputs and lifted to the parent only on submit, so typing does not
 * refetch on every keystroke. Active filters are mirrored as removable chips.
 * "Export CSV" streams the current, filtered list (BE-04); "Set Appointments"
 * opens the appointments modal for the selected leads.
 */
export function LeadsToolbar({
  filters,
  selectedCount,
  exporting,
  onApplyFilters,
  onRemoveFilter,
  onExport,
  onSetAppointments,
}: LeadsToolbarProps) {
  const [draft, setDraft] = useState<LeadFilters>(filters)

  // Keep the draft in sync when filters are cleared from outside (e.g. chips).
  useEffect(() => {
    setDraft(filters)
  }, [filters])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onApplyFilters({
      jobTitle: draft.jobTitle.trim(),
      role: draft.role,
      location: draft.location.trim(),
      q: draft.q.trim(),
    })
  }

  const activeChips = (
    [
      { key: "q", label: "Search", value: filters.q },
      { key: "jobTitle", label: "Job Title", value: filters.jobTitle },
      {
        key: "role",
        label: "Role",
        value: filters.role ? roleLabel(filters.role) : "",
      },
      { key: "location", label: "Location", value: filters.location },
    ] as const
  ).filter((chip) => chip.value)

  return (
    <div className="space-y-3">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="filter-q">Search</Label>
          <Input
            id="filter-q"
            placeholder="Name, email, company…"
            value={draft.q}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, q: event.target.value }))
            }
            className="sm:w-48"
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="filter-job-title">Job Title</Label>
          <Input
            id="filter-job-title"
            placeholder="e.g. Facilities Manager"
            value={draft.jobTitle}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, jobTitle: event.target.value }))
            }
            className="sm:w-44"
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="filter-role">Role</Label>
          <Select
            value={draft.role || ANY_ROLE}
            onValueChange={(value) =>
              setDraft((prev) => ({
                ...prev,
                role: value === ANY_ROLE ? "" : value,
              }))
            }
          >
            <SelectTrigger id="filter-role" className="sm:w-44">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="filter-location">Location</Label>
          <Input
            id="filter-location"
            placeholder="e.g. San Diego"
            value={draft.location}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, location: event.target.value }))
            }
            className="sm:w-44"
          />
        </div>

        <Button type="submit" variant="secondary">
          <Search className="size-4" />
          Apply
        </Button>

        <div className="flex items-center gap-2 sm:ml-auto">
          <Button
            type="button"
            variant="outline"
            onClick={onExport}
            disabled={exporting}
          >
            <Download className="size-4" />
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
          <Button
            type="button"
            onClick={onSetAppointments}
            disabled={selectedCount === 0}
          >
            <CalendarPlus className="size-4" />
            Set Appointments
            {selectedCount > 0 ? ` (${selectedCount})` : ""}
          </Button>
        </div>
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
