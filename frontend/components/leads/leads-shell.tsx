"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  CalendarPlus,
  ChevronDown,
  ChevronRight,
  Download,
  Lock,
  MapPin,
  Plus,
  Save,
  Search,
  Users,
} from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
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
import { config } from "@/lib/config"
import { leadsApi, type LeadItem } from "@/features/leads/api"
import { addToMyLeads } from "@/features/leads/my-leads"
import type { PropertyDetail } from "@/features/estimates/api"

const PAGE_SIZE = 10

// ─── Role pill ─────────────────────────────────────────────────────────────

const ROLE_STYLE: Record<
  string,
  { label: string; bg: string; text: string; border: string }
> = {
  owner: { label: "Owner", bg: "#E8F4F8", text: "#0D4E5E", border: "#C5DEE4" },
  property_manager: {
    label: "Manager",
    bg: "#F0F4F7",
    text: "#3D6678",
    border: "#C8D8E0",
  },
  tenant: {
    label: "Tenant",
    bg: "white",
    text: "#5F7378",
    border: "#DCE4E6",
  },
}

function RolePill({ role }: { role: string }) {
  const s = ROLE_STYLE[role] ?? ROLE_STYLE.tenant
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}
    >
      {s.label}
    </span>
  )
}

// ─── Types ─────────────────────────────────────────────────────────────────

interface ApiFilters {
  jobTitle: string
  role: string
  location: string
  q: string
}

type AddedStatus = "all" | "added" | "not_added"

const EMPTY_API_FILTERS: ApiFilters = {
  jobTitle: "",
  role: "",
  location: "",
  q: "",
}

// ─── Shell ─────────────────────────────────────────────────────────────────

export function LeadsShell({ property }: { property: PropertyDetail }) {
  const propertyId = String(property.id)
  const owner = property.stakeholders.find((s) => s.role === "owner")?.company
  const companyName =
    owner?.name ?? property.address ?? `Property #${property.id}`

  // API data
  const [items, setItems] = useState<LeadItem[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(property.leads_count)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // Filters
  const [apiFilters, setApiFilters] = useState<ApiFilters>(EMPTY_API_FILTERS)
  const [addedStatus, setAddedStatus] = useState<AddedStatus>("all")

  // Client state
  const [added, setAdded] = useState<Set<number>>(new Set())
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [appointmentsOpen, setAppointmentsOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Popover + draft state
  const [jobTitleOpen, setJobTitleOpen] = useState(false)
  const [locationOpen, setLocationOpen] = useState(false)
  const [jobTitleDraft, setJobTitleDraft] = useState("")
  const [locationDraft, setLocationDraft] = useState("")
  const [searchDraft, setSearchDraft] = useState("")
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError("")
      try {
        const data = await leadsApi.list(propertyId, {
          jobTitle: apiFilters.jobTitle || undefined,
          role: apiFilters.role || undefined,
          location: apiFilters.location || undefined,
          q: apiFilters.q || undefined,
          page,
          pageSize: PAGE_SIZE,
        })
        if (!active) return
        setItems(data.items)
        setTotalPages(data.total_pages)
        setTotal(data.total)
      } catch (err) {
        if (active)
          setError(err instanceof Error ? err.message : "Failed to load leads.")
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [propertyId, page, apiFilters])

  // ── Derived ──────────────────────────────────────────────────────────────
  const visibleItems = useMemo(() => {
    if (addedStatus === "all") return items
    if (addedStatus === "added") return items.filter((i) => added.has(i.id))
    return items.filter((i) => !added.has(i.id))
  }, [items, added, addedStatus])

  const allPageSelected =
    visibleItems.length > 0 && visibleItems.every((i) => selected.has(i.id))
  const somePageSelected =
    visibleItems.some((i) => selected.has(i.id)) && !allPageSelected
  const selectedLeads = useMemo(
    () => items.filter((i) => selected.has(i.id)),
    [items, selected],
  )
  const selectedCount = selected.size
  const addedCount = added.size

  // ── Handlers ─────────────────────────────────────────────────────────────
  function toggleOne(id: number, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      checked ? next.add(id) : next.delete(id)
      return next
    })
  }

  function toggleAll(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const item of visibleItems)
        checked ? next.add(item.id) : next.delete(item.id)
      return next
    })
  }

  function markAdded(ids: number[]) {
    setAdded((prev) => {
      const next = new Set(prev)
      for (const id of ids) next.add(id)
      return next
    })
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) next.delete(id)
      return next
    })
  }

  function handleSaveLeadList() {
    const addedItems = items.filter((i) => added.has(i.id))
    if (addedItems.length > 0) addToMyLeads(addedItems)
  }

  async function handleExport() {
    setExporting(true)
    try {
      const resp = await fetch(
        leadsApi.exportUrl(propertyId, {
          jobTitle: apiFilters.jobTitle || undefined,
          role: apiFilters.role || undefined,
          location: apiFilters.location || undefined,
          q: apiFilters.q || undefined,
        }),
      )
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `property-${propertyId}-leads.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      /* swallow */
    } finally {
      setExporting(false)
    }
  }

  function handleSearchChange(value: string) {
    setSearchDraft(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setPage(1)
      setSelected(new Set())
      setApiFilters((prev) => ({ ...prev, q: value.trim() }))
    }, 400)
  }

  function applyJobTitle() {
    setPage(1)
    setSelected(new Set())
    setApiFilters((prev) => ({ ...prev, jobTitle: jobTitleDraft.trim() }))
    setJobTitleOpen(false)
  }

  function clearJobTitle() {
    setJobTitleDraft("")
    setPage(1)
    setSelected(new Set())
    setApiFilters((prev) => ({ ...prev, jobTitle: "" }))
    setJobTitleOpen(false)
  }

  function applyLocation() {
    setPage(1)
    setSelected(new Set())
    setApiFilters((prev) => ({ ...prev, location: locationDraft.trim() }))
    setLocationOpen(false)
  }

  function clearLocation() {
    setLocationDraft("")
    setPage(1)
    setSelected(new Set())
    setApiFilters((prev) => ({ ...prev, location: "" }))
    setLocationOpen(false)
  }

  function toggleRole(role: string) {
    setPage(1)
    setSelected(new Set())
    setApiFilters((prev) => ({
      ...prev,
      role: prev.role === role ? "" : role,
    }))
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: "#F4F7F8" }}
    >
      {/* Breadcrumb bar */}
      <div
        className="flex items-center gap-1.5 px-6 py-3 bg-white border-b text-sm text-[#5F7378] shrink-0"
        style={{ borderColor: "#EAEFF0" }}
      >
        <Link
          href={config.routes.propertyEstimate(propertyId)}
          className="flex items-center gap-1 hover:text-[#0D4E5E] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Project Estimator
        </Link>
        <ChevronRight className="h-3.5 w-3.5 opacity-40" />
        <span className="font-medium text-[#102830]">Generate Leads</span>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1280px] mx-auto px-6 py-6 space-y-5">
          {/* Page header */}
          <div>
            <h1
              className="text-[32px] font-bold text-[#102830] leading-tight mb-3"
              style={{
                fontFamily:
                  "var(--font-inter-tight, 'Inter Tight', sans-serif)",
              }}
            >
              Decision-Maker Leads
            </h1>
            <div className="flex flex-wrap items-center gap-3">
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold text-white"
                style={{ background: "#0D4E5E" }}
              >
                <Users className="h-3.5 w-3.5" />
                {total} Leads Found
              </div>
              <span className="text-sm text-[#5F7378]">
                for{" "}
                <strong className="text-[#102830]">{companyName}</strong>
                {property.address && <> — {property.address}</>}
              </span>
            </div>
          </div>

          {/* Filter bar */}
          <div
            className="bg-white rounded-2xl px-4 py-3 flex items-center gap-2 flex-wrap"
            style={{
              border: "1px solid #EAEFF0",
              boxShadow: "0 1px 2px rgba(16,40,48,0.04)",
            }}
          >
            {/* Job Title popover */}
            <div className="relative">
              <button
                onClick={() => {
                  setJobTitleOpen((v) => !v)
                  setLocationOpen(false)
                }}
                className="flex items-center gap-1.5 h-9 px-3 text-sm rounded-lg transition-colors"
                style={{
                  border: "1px solid #DCE4E6",
                  background: apiFilters.jobTitle ? "#E8F4F8" : "white",
                  color: apiFilters.jobTitle ? "#0D4E5E" : "#102830",
                  fontWeight: apiFilters.jobTitle ? 600 : 400,
                }}
              >
                Job Title
                {apiFilters.jobTitle && (
                  <span
                    className="flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold text-white"
                    style={{ background: "#0D4E5E" }}
                  >
                    1
                  </span>
                )}
                <ChevronDown className="h-3.5 w-3.5 text-[#5F7378]" />
              </button>
              {jobTitleOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setJobTitleOpen(false)}
                  />
                  <div
                    className="absolute left-0 top-full mt-1.5 w-56 bg-white rounded-xl p-3 z-20"
                    style={{
                      border: "1px solid #EAEFF0",
                      boxShadow: "0 8px 24px rgba(16,40,48,0.12)",
                    }}
                  >
                    <input
                      autoFocus
                      placeholder="e.g. Facilities Manager"
                      value={jobTitleDraft}
                      onChange={(e) => setJobTitleDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") applyJobTitle()
                        if (e.key === "Escape") setJobTitleOpen(false)
                      }}
                      className="w-full h-8 px-3 text-sm rounded-lg outline-none"
                      style={{ border: "1px solid #DCE4E6" }}
                    />
                    <div className="flex justify-between items-center mt-2">
                      <button
                        onClick={clearJobTitle}
                        className="text-xs text-[#5F7378] hover:text-[#102830] transition-colors"
                      >
                        Clear
                      </button>
                      <button
                        onClick={applyJobTitle}
                        className="h-7 px-3 text-xs font-semibold text-white rounded-lg"
                        style={{ background: "#0D4E5E" }}
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Role quick-filter buttons */}
            {(["owner", "property_manager", "tenant"] as const).map((role) => {
              const s = ROLE_STYLE[role]
              const active = apiFilters.role === role
              return (
                <button
                  key={role}
                  onClick={() => toggleRole(role)}
                  className="h-9 px-3 text-sm rounded-lg transition-colors"
                  style={{
                    border: active
                      ? `1px solid ${s.border}`
                      : "1px solid #DCE4E6",
                    background: active ? s.bg : "white",
                    color: active ? s.text : "#102830",
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {s.label}
                </button>
              )
            })}

            {/* Location popover */}
            <div className="relative">
              <button
                onClick={() => {
                  setLocationOpen((v) => !v)
                  setJobTitleOpen(false)
                }}
                className="flex items-center gap-1.5 h-9 px-3 text-sm rounded-lg transition-colors"
                style={{
                  border: "1px solid #DCE4E6",
                  background: apiFilters.location ? "#E8F4F8" : "white",
                  color: apiFilters.location ? "#0D4E5E" : "#102830",
                  fontWeight: apiFilters.location ? 600 : 400,
                }}
              >
                <MapPin className="h-3.5 w-3.5 text-[#5F7378]" />
                {apiFilters.location || "All States"}
                <ChevronDown className="h-3.5 w-3.5 text-[#5F7378]" />
              </button>
              {locationOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setLocationOpen(false)}
                  />
                  <div
                    className="absolute left-0 top-full mt-1.5 w-48 bg-white rounded-xl p-3 z-20"
                    style={{
                      border: "1px solid #EAEFF0",
                      boxShadow: "0 8px 24px rgba(16,40,48,0.12)",
                    }}
                  >
                    <input
                      autoFocus
                      placeholder="e.g. Nevada"
                      value={locationDraft}
                      onChange={(e) => setLocationDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") applyLocation()
                        if (e.key === "Escape") setLocationOpen(false)
                      }}
                      className="w-full h-8 px-3 text-sm rounded-lg outline-none"
                      style={{ border: "1px solid #DCE4E6" }}
                    />
                    <div className="flex justify-between items-center mt-2">
                      <button
                        onClick={clearLocation}
                        className="text-xs text-[#5F7378] hover:text-[#102830] transition-colors"
                      >
                        Clear
                      </button>
                      <button
                        onClick={applyLocation}
                        className="h-7 px-3 text-xs font-semibold text-white rounded-lg"
                        style={{ background: "#0D4E5E" }}
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Spacer */}
            <div className="flex-1 min-w-0" />

            {/* Added-status segmented control */}
            <div
              className="flex rounded-lg p-0.5"
              style={{ background: "#F4F7F8", border: "1px solid #EAEFF0" }}
            >
              {(["all", "added", "not_added"] as const).map((status) => {
                const label =
                  status === "all"
                    ? "All"
                    : status === "added"
                      ? "Added"
                      : "Not Added"
                const active = addedStatus === status
                return (
                  <button
                    key={status}
                    onClick={() => setAddedStatus(status)}
                    className="h-7 px-3 text-xs font-medium rounded-md transition-all"
                    style={{
                      background: active ? "white" : "transparent",
                      color: active ? "#102830" : "#5F7378",
                      boxShadow: active
                        ? "0 1px 2px rgba(16,40,48,0.08)"
                        : undefined,
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#9BB0B8] pointer-events-none" />
              <input
                placeholder="Search name or title"
                value={searchDraft}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="h-9 pl-8 pr-3 text-sm rounded-lg outline-none w-44 focus:ring-1 focus:ring-[#C5DEE4] transition-shadow"
                style={{ border: "1px solid #DCE4E6", background: "white" }}
              />
            </div>
          </div>

          {/* Meta row */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-[#5F7378]">
              {loading ? (
                <span className="inline-block w-48 h-4 bg-[#EAEFF0] rounded animate-pulse" />
              ) : (
                <>
                  Showing{" "}
                  <strong className="text-[#102830]">
                    {visibleItems.length}
                  </strong>{" "}
                  of{" "}
                  <strong className="text-[#102830]">{total}</strong> leads ·{" "}
                  <strong className="text-[#102830]">{addedCount}</strong> added
                </>
              )}
            </p>
            <button
              onClick={() => markAdded(Array.from(selected))}
              disabled={selectedCount === 0}
              className="flex items-center gap-1.5 h-8 px-3 text-sm font-medium rounded-lg transition-colors"
              style={
                selectedCount > 0
                  ? {
                      border: "1px solid #C5DEE4",
                      background: "white",
                      color: "#0D4E5E",
                      cursor: "pointer",
                    }
                  : {
                      border: "1px solid #DCE4E6",
                      background: "white",
                      color: "#C4D0D4",
                      cursor: "not-allowed",
                    }
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Add Selected Leads
              {selectedCount > 0 ? ` (${selectedCount})` : ""}
            </button>
          </div>

          {/* Table card */}
          <div
            className="bg-white rounded-2xl overflow-hidden"
            style={{
              border: "1px solid #EAEFF0",
              boxShadow: "0 1px 2px rgba(16,40,48,0.04)",
            }}
          >
            {loading && items.length === 0 ? (
              <div className="p-6 space-y-2.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : error ? (
              <div className="p-12 text-center text-sm text-[#5F7378]">
                {error}
              </div>
            ) : visibleItems.length === 0 ? (
              <div className="p-12 text-center text-sm text-[#5F7378]">
                No leads match the current filters.
              </div>
            ) : (
              <Table
                className={
                  loading ? "opacity-60 transition-opacity" : undefined
                }
              >
                <TableHeader>
                  <TableRow style={{ background: "#F8FAFB" }}>
                    <TableHead className="w-10 pl-4">
                      <Checkbox
                        checked={
                          allPageSelected
                            ? true
                            : somePageSelected
                              ? "indeterminate"
                              : false
                        }
                        onCheckedChange={(v) => toggleAll(v === true)}
                        aria-label="Select all leads on this page"
                      />
                    </TableHead>
                    {[
                      "Job Title",
                      "Lead Location",
                      "Relationship",
                      "Company",
                      "Lead Name",
                      "Lead Email",
                      "Lead Phone",
                    ].map((h) => (
                      <TableHead
                        key={h}
                        className="text-[10px] font-semibold text-[#5F7378] uppercase tracking-wider"
                      >
                        {h}
                      </TableHead>
                    ))}
                    <TableHead className="text-[10px] font-semibold text-[#5F7378] uppercase tracking-wider w-10">
                      In
                    </TableHead>
                    <TableHead className="w-28 pr-4" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleItems.map((lead) => {
                    const isSelected = selected.has(lead.id)
                    const isAdded = added.has(lead.id)
                    const liUrl = lead.linkedin?.startsWith("https://")
                      ? lead.linkedin
                      : null
                    return (
                      <TableRow
                        key={lead.id}
                        data-state={isSelected ? "selected" : undefined}
                      >
                        <TableCell className="pl-4">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(v) =>
                              toggleOne(lead.id, v === true)
                            }
                            aria-label={`Select ${lead.name ?? "lead"}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium text-[#102830] text-sm">
                          {lead.job_title ?? (
                            <span className="text-[#C4D0D4]">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-[#5F7378] text-sm">
                          {lead.lead_location ?? (
                            <span className="text-[#C4D0D4]">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <RolePill role={lead.role} />
                        </TableCell>
                        <TableCell className="text-[#5F7378] text-sm">
                          {lead.company?.name ?? (
                            <span className="text-[#C4D0D4]">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-[#102830]">
                          {lead.name ?? (
                            <span className="text-[#C4D0D4]">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {lead.email ? (
                            <a
                              href={`mailto:${lead.email}`}
                              className="text-[#0D4E5E] hover:underline underline-offset-2"
                            >
                              {lead.email}
                            </a>
                          ) : (
                            <span className="text-[#C4D0D4]">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-[#102830]">
                          {lead.phone ?? (
                            <span className="text-[#C4D0D4]">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {liUrl ? (
                            <a
                              href={liUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold text-white hover:opacity-80 transition-opacity"
                              style={{ background: "#0A66C2" }}
                            >
                              in
                            </a>
                          ) : (
                            <span className="text-[#C4D0D4]">—</span>
                          )}
                        </TableCell>
                        <TableCell className="pr-4">
                          <button
                            onClick={() => {
                              if (!isAdded) markAdded([lead.id])
                            }}
                            disabled={isAdded}
                            className="flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors"
                            style={
                              isAdded
                                ? {
                                    background: "#E9F8F0",
                                    color: "#0C6E48",
                                    border: "1px solid #A3DFC0",
                                    cursor: "default",
                                  }
                                : {
                                    background: "#0D4E5E",
                                    color: "white",
                                    border: "1px solid #0D4E5E",
                                    cursor: "pointer",
                                  }
                            }
                          >
                            <Lock className="h-3 w-3" />
                            {isAdded ? "Added" : "Add Lead"}
                          </button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pb-2">
              <button
                disabled={page <= 1}
                onClick={() => {
                  setPage((p) => p - 1)
                  setSelected(new Set())
                }}
                className="h-9 px-4 text-sm font-medium text-[#5F7378] rounded-lg transition-colors hover:bg-[#EDF6F8] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ border: "1px solid #DCE4E6" }}
              >
                Previous
              </button>
              <span className="text-sm text-[#5F7378]">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => {
                  setPage((p) => p + 1)
                  setSelected(new Set())
                }}
                className="h-9 px-4 text-sm font-medium text-[#5F7378] rounded-lg transition-colors hover:bg-[#EDF6F8] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ border: "1px solid #DCE4E6" }}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sticky footer */}
      <footer
        className="flex items-center justify-between px-6 py-3 bg-white border-t shrink-0 gap-3"
        style={{ borderColor: "#EAEFF0" }}
      >
        <div className="flex items-center gap-2">
          <Link
            href={config.routes.propertyEstimate(propertyId)}
            className="flex items-center gap-1.5 h-9 px-4 text-sm font-medium text-[#5F7378] hover:text-[#0D4E5E] hover:bg-[#F4F7F8] rounded-lg transition-colors"
            style={{ border: "1px solid #DCE4E6" }}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Estimator
          </Link>
          <Link
            href={config.routes.results}
            className="flex items-center gap-1.5 h-9 px-4 text-sm font-medium text-[#5F7378] hover:text-[#0D4E5E] hover:bg-[#F4F7F8] rounded-lg transition-colors"
            style={{ border: "1px solid #DCE4E6" }}
          >
            Back to Rooftop Results
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveLeadList}
            className="flex items-center gap-1.5 h-9 px-4 text-sm font-medium text-[#5F7378] hover:bg-[#F4F7F8] rounded-lg transition-colors"
            style={{ border: "1px solid #DCE4E6" }}
          >
            <Save className="h-4 w-4" />
            Save Lead List
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 h-9 px-4 text-sm font-medium text-[#5F7378] hover:bg-[#F4F7F8] rounded-lg transition-colors disabled:opacity-50"
            style={{ border: "1px solid #DCE4E6" }}
          >
            <Download className="h-4 w-4" />
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
          <button
            onClick={() => setAppointmentsOpen(true)}
            disabled={selectedCount === 0}
            className="flex items-center gap-1.5 h-9 px-4 text-sm font-semibold text-white rounded-lg transition-colors"
            style={{ background: selectedCount > 0 ? "#102830" : "#C4D0D4" }}
          >
            <CalendarPlus className="h-4 w-4" />
            Set Appointments
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </footer>

      <AppointmentsModal
        open={appointmentsOpen}
        onOpenChange={setAppointmentsOpen}
        selectedLeads={selectedLeads}
        onHandledInHouse={() => setSelected(new Set())}
      />
    </div>
  )
}
