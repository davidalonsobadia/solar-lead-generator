"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { BookmarkX, Download, ExternalLink, Trash2 } from "lucide-react"

import {
  getMyLeads,
  removeFromMyLeads,
  clearMyLeads,
} from "@/features/leads/my-leads"
import type { LeadItem } from "@/features/leads/api"
import { config } from "@/lib/config"

function roleLabel(role: string): string {
  return role
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ")
}

function safeHttpsUrl(url: string | null | undefined): string | undefined {
  return url && url.startsWith("https://") ? url : undefined
}

function cell(value: string | null | undefined) {
  if (!value) return <span className="text-[#AAB8BB]">—</span>
  return value
}

function exportToCsv(leads: LeadItem[]) {
  const headers = [
    "Name",
    "Company",
    "Job Title",
    "Email",
    "Phone",
    "LinkedIn",
    "Role",
    "Location",
  ]
  const rows = leads.map((lead) => [
    lead.name ?? "",
    lead.company?.name ?? "",
    lead.job_title ?? "",
    lead.email ?? "",
    lead.phone ?? "",
    lead.linkedin ?? "",
    roleLabel(lead.role),
    lead.lead_location ?? "",
  ])
  const csv = [headers, ...rows]
    .map((row) =>
      row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
    )
    .join("\n")
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "my-lead-list.csv"
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function MyListsPage() {
  const [leads, setLeads] = useState<LeadItem[]>([])
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setLeads(getMyLeads())
    setMounted(true)
  }, [])

  function handleRemove(id: number) {
    removeFromMyLeads(id)
    setLeads((prev) => prev.filter((l) => l.id !== id))
  }

  function handleClearAll() {
    clearMyLeads()
    setLeads([])
  }

  if (!mounted) return null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-[32px] font-bold text-[#102830] leading-tight"
            style={{ fontFamily: "var(--font-inter-tight, 'Inter Tight', sans-serif)" }}
          >
            My Lead List
          </h1>
          <p className="mt-2 text-[15px] text-[#5F7378]">
            Decision-makers you saved while browsing leads.
          </p>
        </div>

        {leads.length > 0 && (
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => exportToCsv(leads)}
              className="inline-flex items-center gap-2 h-9 px-4 text-sm font-medium text-[#0D4E5E] rounded-lg transition-colors hover:bg-[#EDF6F8]"
              style={{ border: "1.5px solid #C5DEE4" }}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <button
              onClick={handleClearAll}
              className="inline-flex items-center gap-2 h-9 px-4 text-sm font-medium text-[#B91C1C] rounded-lg transition-colors hover:bg-red-50"
              style={{ border: "1.5px solid #FECACA" }}
            >
              <BookmarkX className="h-4 w-4" />
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Empty state */}
      {leads.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-24 bg-white rounded-2xl text-center"
          style={{ border: "1px solid #EAEFF0", boxShadow: "0 1px 2px rgba(16,42,48,0.04)" }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: "#F4F7F8", border: "1px solid #EAEFF0" }}
          >
            <BookmarkX className="h-6 w-6 text-[#AAB8BB]" />
          </div>
          <p className="text-lg font-semibold text-[#102830] mb-1">No leads saved yet</p>
          <p className="text-sm text-[#5F7378] mb-6 max-w-xs">
            Browse rooftop results, open a property&apos;s leads, select contacts, and click
            &ldquo;Save to My List.&rdquo;
          </p>
          <Link
            href={config.routes.findLeads}
            className="inline-flex items-center gap-2 h-10 px-5 text-sm font-semibold text-white rounded-xl transition-opacity hover:opacity-90"
            style={{ background: "linear-gradient(180deg, #0F586A 0%, #0C4453 100%)" }}
          >
            Find Leads
          </Link>
        </div>
      ) : (
        /* Table */
        <div
          className="bg-white rounded-2xl overflow-hidden"
          style={{ border: "1px solid #EAEFF0", boxShadow: "0 1px 2px rgba(16,42,48,0.04)" }}
        >
          <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: "#EAEFF0" }}>
            <span className="text-sm font-medium text-[#5F7378]">
              {leads.length} saved contact{leads.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left" style={{ borderColor: "#EAEFF0", background: "#FAFCFC" }}>
                  <th className="px-5 py-3 text-xs font-semibold text-[#5F7378] uppercase tracking-wider">Name</th>
                  <th className="px-5 py-3 text-xs font-semibold text-[#5F7378] uppercase tracking-wider">Company</th>
                  <th className="px-5 py-3 text-xs font-semibold text-[#5F7378] uppercase tracking-wider">Job Title</th>
                  <th className="px-5 py-3 text-xs font-semibold text-[#5F7378] uppercase tracking-wider">Role</th>
                  <th className="px-5 py-3 text-xs font-semibold text-[#5F7378] uppercase tracking-wider">Email</th>
                  <th className="px-5 py-3 text-xs font-semibold text-[#5F7378] uppercase tracking-wider">Phone</th>
                  <th className="px-5 py-3 text-xs font-semibold text-[#5F7378] uppercase tracking-wider">LinkedIn</th>
                  <th className="px-5 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {leads.map((lead, idx) => {
                  const linkedinUrl = safeHttpsUrl(lead.linkedin)
                  return (
                    <tr
                      key={lead.id}
                      className="border-b hover:bg-[#FAFCFC] transition-colors"
                      style={{ borderColor: idx === leads.length - 1 ? "transparent" : "#EAEFF0" }}
                    >
                      <td className="px-5 py-3.5 font-medium text-[#102830]">{cell(lead.name)}</td>
                      <td className="px-5 py-3.5 text-[#5F7378]">{cell(lead.company?.name)}</td>
                      <td className="px-5 py-3.5 text-[#5F7378]">{cell(lead.job_title)}</td>
                      <td className="px-5 py-3.5 text-[#5F7378]">{roleLabel(lead.role)}</td>
                      <td className="px-5 py-3.5">
                        {lead.email ? (
                          <a
                            href={`mailto:${lead.email}`}
                            className="text-[#0D4E5E] hover:underline underline-offset-4"
                          >
                            {lead.email}
                          </a>
                        ) : (
                          cell(null)
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-[#5F7378]">{cell(lead.phone)}</td>
                      <td className="px-5 py-3.5">
                        {linkedinUrl ? (
                          <a
                            href={linkedinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[#0D4E5E] hover:underline underline-offset-4"
                          >
                            Profile
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          cell(null)
                        )}
                      </td>
                      <td className="px-3 py-3.5">
                        <button
                          onClick={() => handleRemove(lead.id)}
                          aria-label="Remove from list"
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-[#AAB8BB] hover:text-[#B91C1C] hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
