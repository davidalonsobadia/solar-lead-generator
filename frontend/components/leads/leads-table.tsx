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
import { leadsApi, type LeadItem } from "@/features/leads/api"

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

interface LeadsTableProps {
  propertyId: string
}

// Generate Leads table (FE-09): decision-makers for a property from
// GET /api/v1/properties/{id}/leads, with 25/page pagination and row
// multi-select. Filters/export/actions are out of scope (FE-10).
export function LeadsTable({ propertyId }: LeadsTableProps) {
  const [items, setItems] = useState<LeadItem[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [selected, setSelected] = useState<Set<number>>(new Set())

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError("")
      try {
        const data = await leadsApi.list(propertyId, {
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
  }, [propertyId, page])

  function toggleOne(id: number, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  function toggleAll(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const item of items) {
        if (checked) {
          next.add(item.id)
        } else {
          next.delete(item.id)
        }
      }
      return next
    })
  }

  // Header checkbox reflects the current page's selection state.
  const pageSelectedCount = useMemo(
    () => items.filter((item) => selected.has(item.id)).length,
    [items, selected],
  )
  const allPageSelected = items.length > 0 && pageSelectedCount === items.length
  const somePageSelected = pageSelectedCount > 0 && !allPageSelected

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full rounded-md" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Could not load leads</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (items.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Inbox />
          </EmptyMedia>
          <EmptyTitle>No leads found</EmptyTitle>
          <EmptyDescription>
            This property has no decision-makers resolved yet.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="space-y-4">
      <Table>
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
                      toggleOne(lead.id, checked === true)
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
                  {lead.linkedin ? (
                    <a
                      className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                      href={lead.linkedin}
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
    </div>
  )
}
