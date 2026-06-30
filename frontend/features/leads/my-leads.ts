// "My Leads" store (FE-10).
//
// DECISION (v1): "My Leads" is persisted client-side in localStorage, NOT in
// the database. Rationale: there is no "My Leads" screen or cross-device
// requirement in v1, and a DB-backed saved-list would need a new table,
// migration, ownership rules and endpoints — out of scope for this task and its
// non-goals (no payment gating, minimal change). When a multi-device "My Leads"
// workspace is specced, migrate this to a backend resource (lists domain) and
// swap the storage calls below; the call sites stay the same.
"use client"

import type { LeadItem } from "./api"

const STORAGE_KEY = "sunscout:my-leads"

/** Read the saved leads, tolerating absent/corrupt storage. */
export function getMyLeads(): LeadItem[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as LeadItem[]) : []
  } catch {
    return []
  }
}

/**
 * Add leads to "My Leads", de-duplicating by id. Returns the number of leads
 * newly added (existing ones are ignored).
 */
export function addToMyLeads(leads: LeadItem[]): number {
  if (typeof window === "undefined" || leads.length === 0) return 0
  const existing = getMyLeads()
  const known = new Set(existing.map((lead) => lead.id))
  const fresh = leads.filter((lead) => !known.has(lead.id))
  if (fresh.length === 0) return 0
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([...existing, ...fresh]),
    )
  } catch {
    return 0
  }
  return fresh.length
}

/** Remove a single lead by id. Returns true if the lead was found and removed. */
export function removeFromMyLeads(id: number): boolean {
  if (typeof window === "undefined") return false
  const existing = getMyLeads()
  const next = existing.filter((lead) => lead.id !== id)
  if (next.length === existing.length) return false
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    return false
  }
  return true
}

/** Remove all saved leads. */
export function clearMyLeads(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
