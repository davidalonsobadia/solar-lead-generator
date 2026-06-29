"use client"

import { useState } from "react"
import { AlertCircle, CheckCircle2 } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { rfpApi, type Rfp, type RfpCreateInput } from "@/features/rfp/api"

/** System type options offered for the requested scope. */
const SYSTEM_TYPES = [
  { value: "grid_tied", label: "Grid-tied" },
  { value: "hybrid", label: "Hybrid" },
  { value: "off_grid", label: "Off-grid" },
] as const

/** Values the form can be precharged with when arriving from a property. */
export interface RfpFormDefaults {
  propertyId?: number | null
  organizationName?: string | null
  propertyAddress?: string | null
  contactCompany?: string | null
}

/** All editable fields, kept as strings so inputs can be cleared while typing. */
interface FormState {
  organizationName: string
  propertyAddress: string
  systemType: string
  approxSizeKw: string
  includeBess: boolean
  contactName: string
  contactEmail: string
  contactPhone: string
  contactCompany: string
  notes: string
}

type SubmitState = "idle" | "submitting" | "success" | "error"

/** Parse an input string to a finite number, or null when blank/invalid. */
function parseNum(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === "") {
    return null
  }
  const num = Number(trimmed)
  return Number.isFinite(num) ? num : null
}

/** Normalize a trimmed text field to its value or null when empty. */
function orNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

function buildInput(form: FormState, propertyId: number | null): RfpCreateInput {
  return {
    property_id: propertyId,
    payload: {
      organization_name: orNull(form.organizationName),
      property_address: orNull(form.propertyAddress),
      system_type: form.systemType || null,
      approx_size_kw: parseNum(form.approxSizeKw),
      include_bess: form.includeBess,
      notes: orNull(form.notes),
    },
    contact_name: orNull(form.contactName),
    contact_email: orNull(form.contactEmail),
    contact_phone: orNull(form.contactPhone),
    contact_company: orNull(form.contactCompany),
  }
}

interface RfpFormProps {
  defaults?: RfpFormDefaults
}

// The RFP tab form (FE-11): collects scope + contact data and persists via
// POST /api/v1/rfp. Precharges organization/address when opened from a property.
export function RfpForm({ defaults }: RfpFormProps) {
  const propertyId = defaults?.propertyId ?? null

  const [form, setForm] = useState<FormState>(() => ({
    organizationName: defaults?.organizationName ?? "",
    propertyAddress: defaults?.propertyAddress ?? "",
    systemType: "grid_tied",
    approxSizeKw: "",
    includeBess: false,
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    contactCompany: defaults?.contactCompany ?? "",
    notes: "",
  }))
  const [state, setState] = useState<SubmitState>("idle")
  const [error, setError] = useState("")
  const [created, setCreated] = useState<Rfp | null>(null)

  const update = (key: keyof FormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setState("submitting")
    setError("")
    setCreated(null)
    try {
      const rfp = await rfpApi.create(buildInput(form, propertyId))
      setCreated(rfp)
      setState("success")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create the RFP.")
      setState("error")
    }
  }

  const submitting = state === "submitting"

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {propertyId !== null && (
        <p className="text-sm text-muted-foreground">
          Precharged from property #{propertyId}. Edit any field before sending.
        </p>
      )}

      {state === "success" && created && (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertTitle>RFP saved</AlertTitle>
          <AlertDescription>
            RFP #{created.id} was created with status &ldquo;
            {created.status ?? "draft"}&rdquo;.
          </AlertDescription>
        </Alert>
      )}

      {state === "error" && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Could not save the RFP</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Organization / property -------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Organization &amp; property</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="organization-name">Organization</Label>
            <Input
              id="organization-name"
              value={form.organizationName}
              placeholder="Company or organization name"
              onChange={(e) => update("organizationName", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="property-address">Property address</Label>
            <Input
              id="property-address"
              value={form.propertyAddress}
              placeholder="Street, city, state"
              onChange={(e) => update("propertyAddress", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Requested scope ---------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Requested scope</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="system-type">System type</Label>
            <Select
              value={form.systemType}
              onValueChange={(value) => update("systemType", value)}
            >
              <SelectTrigger id="system-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SYSTEM_TYPES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="approx-size">Approximate size (kW)</Label>
            <Input
              id="approx-size"
              type="number"
              inputMode="decimal"
              value={form.approxSizeKw}
              placeholder="e.g. 250"
              onChange={(e) => update("approxSizeKw", e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="include-bess" className="font-normal">
              Include battery energy storage (BESS)
            </Label>
            <Switch
              id="include-bess"
              checked={form.includeBess}
              onCheckedChange={(checked) => update("includeBess", checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Contact data ------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="contact-name">Name</Label>
            <Input
              id="contact-name"
              value={form.contactName}
              onChange={(e) => update("contactName", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-company">Company</Label>
            <Input
              id="contact-company"
              value={form.contactCompany}
              onChange={(e) => update("contactCompany", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-email">Email</Label>
            <Input
              id="contact-email"
              type="email"
              value={form.contactEmail}
              placeholder="name@example.com"
              onChange={(e) => update("contactEmail", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-phone">Phone</Label>
            <Input
              id="contact-phone"
              type="tel"
              value={form.contactPhone}
              onChange={(e) => update("contactPhone", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Notes -------------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            id="notes"
            rows={4}
            value={form.notes}
            placeholder="Additional context for the request"
            onChange={(e) => update("notes", e.target.value)}
          />
        </CardContent>
      </Card>

      <Button type="submit" disabled={submitting}>
        {submitting ? "Sending…" : "Generate/Send RFP"}
      </Button>
    </form>
  )
}
