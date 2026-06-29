"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Handshake, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { LeadItem } from "@/features/leads/api"
import { addToMyLeads } from "@/features/leads/my-leads"

type Outcome =
  | { kind: "in_house"; added: number }
  | { kind: "experts" }
  | null

interface AppointmentsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedLeads: LeadItem[]
  /** Called after the selected leads are handled in-house (saved to My Leads). */
  onHandledInHouse?: () => void
}

/**
 * Set Appointments modal (FE-10).
 *
 * Offers two ways to act on the selected leads:
 *  - Handle In-House: save them to "My Leads" (client-side store, see
 *    features/leads/my-leads.ts) so the user works them directly.
 *  - Let Our Experts Handle It: a CTA to hand the leads to the Sunscout team.
 *    No payment gating in v1 (out of scope), so this records intent and
 *    confirms; the booking/billing flow is a follow-up.
 */
export function AppointmentsModal({
  open,
  onOpenChange,
  selectedLeads,
  onHandledInHouse,
}: AppointmentsModalProps) {
  const [outcome, setOutcome] = useState<Outcome>(null)
  const count = selectedLeads.length

  // Reset to the choice step every time the modal is (re)opened.
  useEffect(() => {
    if (open) setOutcome(null)
  }, [open])

  function handleInHouse() {
    const added = addToMyLeads(selectedLeads)
    setOutcome({ kind: "in_house", added })
    onHandledInHouse?.()
  }

  function handleExperts() {
    setOutcome({ kind: "experts" })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {outcome === null ? (
          <>
            <DialogHeader>
              <DialogTitle>Set Appointments</DialogTitle>
              <DialogDescription>
                {count === 1
                  ? "Choose how to work the 1 selected lead."
                  : `Choose how to work the ${count} selected leads.`}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleInHouse}
                className="flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors hover:border-primary hover:bg-accent"
              >
                <Users className="size-5 text-primary" />
                <span className="font-medium">Handle In-House</span>
                <span className="text-sm text-muted-foreground">
                  Save the selected leads to My Leads and reach out yourself.
                </span>
              </button>

              <button
                type="button"
                onClick={handleExperts}
                className="flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors hover:border-primary hover:bg-accent"
              >
                <Handshake className="size-5 text-primary" />
                <span className="font-medium">Let Our Experts Handle It</span>
                <span className="text-sm text-muted-foreground">
                  Hand the leads to the Sunscout team to book appointments for
                  you.
                </span>
              </button>
            </div>
          </>
        ) : outcome.kind === "in_house" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-primary" />
                Saved to My Leads
              </DialogTitle>
              <DialogDescription>
                {outcome.added === 0
                  ? "These leads were already in My Leads."
                  : outcome.added === 1
                    ? "1 lead was added to My Leads."
                    : `${outcome.added} leads were added to My Leads.`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-primary" />
                Request received
              </DialogTitle>
              <DialogDescription>
                Our experts will reach out about the {count}{" "}
                {count === 1 ? "lead" : "leads"} you selected and set
                appointments on your behalf.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
