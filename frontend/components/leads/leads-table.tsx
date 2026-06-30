"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle, ExternalLink, Inbox } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AppointmentsModal } from "@/components/leads/appointments-modal"
import {
  EMPTY_LEAD_FILTERS,
  LeadsToolbar,
  type LeadFilters,
} from "@/components/leads/leads-toolbar"
import { leadsApi, type LeadItem, type LeadListParams } from "@/features/leads/api"
import { addToMyLeads } from "@/features/leads/my-leads"

const PAGE_SIZE = 25

// Human-readable label for a stakeholder role (owner|tenant|property_manager).
function roleLabel(role: string): string {
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

/** Render a cell value, falling back to a muted dash when empty. */
function cell(value: string | null | undefined) {
  if (!value) return <span className="text-muted-foreground">—</span>
  return value
}

// Only treat a lead URL as a usable link when it is an explicit https:// URL.
// This rejects javascript:/data: schemes that could otherwise reach the href
// from backend data and execute in the authenticated user's browser.
function safeHttpsUrl(url: string | null | undefined): string | undefined {
  return url && url.startsWith("https://") ? url : undefined
}

// Map the UI filter draft to the backend query params, dropping empty values.
function toListParams(filters: LeadFilters): LeadListParams {
  return {
    jobTitle: filters.jobTitle || undefined,
    role: filters.role || undefined,
    location: filters.location || undefined,
    q: filters.q || undefined,
  }
}

interface LeadsTableProps {
  propertyId: string
}

// Generate Leads screen (FE-09/FE-10): decision-makers for a property from
// GET /api/v1/properties/{id}/leads with filters, 25/page pagination and row
// multi-select. The toolbar drives filters/export, and the selected leads feed
// the Set Appointments modal.
export function LeadsTable({ propertyId }: LeadsTableProps) {
  const [items, setItems] = useState<LeadItem[]>([])
  const [filters, setFilters] = useState<LeadFilters>(EMPTY_LEAD_FILTERS)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState("")
  const [appointmentsOpen, setAppointmentsOpen] = useState(false)
  // Track selected leads as full objects (keyed by id) so the appointments
  // modal can act on selections that span multiple pages.
  const [selected, setSelected] = useState<Map<number, LeadItem>>(new Map())
  const [saveNote, setSaveNote] = useState("")

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError("")
      try {
        const data = await leadsApi.list(propertyId, {
          ...toListParams(filters),
          page,
          pageSize: PAGE_SIZE,
        })
        if (!active) return
        setItems(data.items)
        setTotalPages(data.total_pages)
        setTotal(data.total)
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load leads.")
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
  }, [propertyId, page, filters])

  // Defensive: if the property changes, reset filters/paging so we never request
  // page N (or a filtered view) of a property that may differ entirely.
  useEffect(() => {
    setPage(1)
    setFilters(EMPTY_LEAD_FILTERS)
    setSelected(new Map())
  }, [propertyId])

  // Reset to the first page whenever the filters change.
  useEffect(() => {
    setPage(1)
  }, [filters])

  function toggleOne(lead: LeadItem, checked: boolean) {
    setSelected((prev) => {
      const next = new Map(prev)
      if (checked) {
        next.set(lead.id, lead)
      } else {
        next.delete(lead.id)
      }
      return next
    })
  }

  function toggleAll(checked: boolean) {
    setSelected((prev) => {
      const next = new Map(prev)
      for (const item of items) {
        if (checked) {
          next.set(item.id, item)
        } else {
          next.delete(item.id)
        }
      }
      return next
    })
  }

  async function handleExport() {
    setExporting(true)
    setExportError("")
    try {
      const response = await fetch(leadsApi.exportUrl(propertyId, toListParams(filters)))
      if (!response.ok) {
        let message = `Failed to export leads (HTTP ${response.status}).`
        try {
          const data = await response.json()
          if (data?.message) message = data.message
        } catch {
          // Non-JSON error body; keep the default message.
        }
        throw new Error(message)
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `property-${propertyId}-leads.csv`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Failed to export leads.",
      )
    } finally {
      setExporting(false)
    }
  }

  function handleSaveToList() {
    const leads = Array.from(selected.values())
    const added = addToMyLeads(leads)
    setSaveNote(
      added === 0
        ? "Already in your list."
        : `${added} lead${added !== 1 ? "s" : ""} saved to My List.`,
    )
    setTimeout(() => setSaveNote(""), 4000)
  }

  const selectedLeads = useMemo(() => Array.from(selected.values()), [selected])

  // Header checkbox reflects the current page's selection state.
  const pageSelectedCount = useMemo(
    () => items.filter((item) => selected.has(item.id)).length,
    [items, selected],
  )
  const allPageSelected = items.length > 0 && pageSelectedCount === items.length
  const somePageSelected = pageSelectedCount > 0 && !allPageSelected

  const toolbar = (
    <LeadsToolbar
      filters={filters}
      selectedCount={selected.size}
      exporting={exporting}
      onApplyFilters={setFilters}
      onRemoveFilter={(key) =>
        setFilters((prev) => ({ ...prev, [key]: "" }))
      }
      onExport={handleExport}
      onSetAppointments={() => setAppointmentsOpen(true)}
      onSaveToList={handleSaveToList}
    />
  )

  const saveAlert = saveNote ? (
    <p className="text-sm text-[#0D4E5E]">{saveNote}</p>
  ) : null

  const exportAlert = exportError ? (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Could not export leads</AlertTitle>
      <AlertDescription>{exportError}</AlertDescription>
    </Alert>
  ) : null

  const appointments = (
    <AppointmentsModal
      open={appointmentsOpen}
      onOpenChange={setAppointmentsOpen}
      selectedLeads={selectedLeads}
      onHandledInHouse={() => setSelected(new Map())}
    />
  )

  // Only show the skeleton on the very first load. On page/filter changes we
  // keep the toolbar visible so the user can keep refining the query.
  if (loading && items.length === 0 && !error) {
    return (
      <div className="space-y-4">
        {toolbar}
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full rounded-md" />
          ))}
        </div>
        {appointments}
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        {toolbar}
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Could not load leads</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        {appointments}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        {toolbar}
        {exportAlert}
      {saveAlert}
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Inbox />
            </EmptyMedia>
            <EmptyTitle>No leads found</EmptyTitle>
            <EmptyDescription>
              No decision-makers match the current filters.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
        {appointments}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {toolbar}
      {exportAlert}
      {saveAlert}
      <Table className={loading ? "opacity-60 transition-opacity" : undefined}>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                aria-label="Select all leads on this page"
                checked={
                  allPageSelected
                    ? true
                    : somePageSelected
                      ? "indeterminate"
                      : false
                }
                onCheckedChange={(checked) => toggleAll(checked === true)}
              />
            </TableHead>
            <TableHead>Job Title</TableHead>
            <TableHead>Lead Location</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>LinkedIn</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((lead) => {
            const isSelected = selected.has(lead.id)
            const linkedinUrl = safeHttpsUrl(lead.linkedin)
            return (
              <TableRow
                key={lead.id}
                data-state={isSelected ? "selected" : undefined}
              >
                <TableCell>
                  <Checkbox
                    aria-label={`Select ${lead.name ?? "lead"}`}
                    checked={isSelected}
                    onCheckedChange={(checked) =>
                      toggleOne(lead, checked === true)
                    }
                  />
                </TableCell>
                <TableCell>{cell(lead.job_title)}</TableCell>
                <TableCell>{cell(lead.lead_location)}</TableCell>
                <TableCell>{roleLabel(lead.role)}</TableCell>
                <TableCell>{cell(lead.company?.name)}</TableCell>
                <TableCell>{cell(lead.name)}</TableCell>
                <TableCell>
                  {lead.email ? (
                    <a
                      className="text-primary underline-offset-4 hover:underline"
                      href={`mailto:${lead.email}`}
                    >
                      {lead.email}
                    </a>
                  ) : (
                    cell(null)
                  )}
                </TableCell>
                <TableCell>{cell(lead.phone)}</TableCell>
                <TableCell>
                  {linkedinUrl ? (
                    <a
                      className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                      href={linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Profile
                      <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    cell(null)
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
        <p className="text-sm text-muted-foreground">
          {selected.size} selected · {total} total
        </p>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          >
            Next
          </Button>
        </div>
      </div>

      {appointments}
    </div>
  )
}
