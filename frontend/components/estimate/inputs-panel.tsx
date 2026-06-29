"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AlertCircle, Plus, Trash2 } from "lucide-react"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  estimatesApi,
  type Estimate,
  type Incentive,
  type EstimateInput,
  type PropertyDetail,
} from "@/features/estimates/api"

// How long to wait after the last edit before autosaving.
const DEBOUNCE_MS = 800

type Numeric = number | string | null

/** A locally-edited incentive row (value kept as a string while editing). */
interface IncentiveRow {
  // Stable id so React keys survive row deletion (avoids focus/cursor jumps).
  uid: string
  name: string
  type: "percentage" | "fixed"
  value: string
}

/** Build a fresh, empty incentive row with a stable id. */
function newIncentiveRow(): IncentiveRow {
  return { uid: crypto.randomUUID(), name: "", type: "percentage", value: "" }
}

/** All editable inputs, kept as strings so fields can be cleared while typing. */
interface FormState {
  systemSizeKw: string
  systemLossesPct: string
  shadingPct: string
  pricePerWatt: string
  blendedUtilityRate: string
  rateEscalationPct: string
  annualConsumptionKwh: string
  includeBess: boolean
  incentives: IncentiveRow[]
}

type SaveState = "idle" | "saving" | "saved" | "error"

/** Render a backend numeric (number or string) as an input-ready string. */
function numToStr(value: Numeric): string {
  if (value === null || value === undefined || value === "") {
    return ""
  }
  const num = typeof value === "string" ? Number(value) : value
  return Number.isFinite(num) ? String(num) : ""
}

/** Parse an input string to a finite number, or undefined when blank/invalid. */
function parseNum(value: string): number | undefined {
  const trimmed = value.trim()
  if (trimmed === "") {
    return undefined
  }
  const num = Number(trimmed)
  return Number.isFinite(num) ? num : undefined
}

/** Format a Decimal area (number or string) as a rounded ft² value. */
function formatArea(value: Numeric): string {
  const str = numToStr(value)
  if (str === "") {
    return "—"
  }
  return `${Math.round(Number(str)).toLocaleString()} ft²`
}

/** Format a plain numeric/text field for read-only display. */
function formatText(value: Numeric | number | string | null): string {
  if (value === null || value === undefined || value === "") {
    return "—"
  }
  return String(value)
}

/** Build the form state from a persisted estimate's inputs. */
function estimateToForm(estimate: Estimate): FormState {
  return {
    systemSizeKw: numToStr(estimate.system_size_kw),
    systemLossesPct: numToStr(estimate.system_losses_pct),
    shadingPct: numToStr(estimate.shading_pct),
    pricePerWatt: numToStr(estimate.price_per_watt),
    blendedUtilityRate: numToStr(estimate.blended_utility_rate),
    rateEscalationPct: numToStr(estimate.rate_escalation_pct),
    annualConsumptionKwh: numToStr(estimate.annual_consumption_kwh),
    includeBess: Boolean(estimate.include_bess),
    incentives: (estimate.incentives ?? []).map((inc) => ({
      uid: crypto.randomUUID(),
      name: inc.name ?? "",
      type: inc.type === "fixed" ? "fixed" : "percentage",
      value: numToStr(inc.value),
    })),
  }
}

/** An empty form used before the first estimate exists. */
function emptyForm(): FormState {
  return {
    systemSizeKw: "",
    systemLossesPct: "",
    shadingPct: "",
    pricePerWatt: "",
    blendedUtilityRate: "",
    rateEscalationPct: "",
    annualConsumptionKwh: "",
    includeBess: false,
    incentives: [],
  }
}

// Consumption is sent only when set manually; the backend keeps an auto-filled value.
function toInput(form: FormState, consumptionManual: boolean): EstimateInput {
  const input: EstimateInput = {
    system_size_kw: parseNum(form.systemSizeKw),
    system_losses_pct: parseNum(form.systemLossesPct),
    shading_pct: parseNum(form.shadingPct),
    price_per_watt: parseNum(form.pricePerWatt),
    blended_utility_rate: parseNum(form.blendedUtilityRate),
    rate_escalation_pct: parseNum(form.rateEscalationPct),
    include_bess: form.includeBess,
    incentives: form.incentives
      .filter((inc) => parseNum(inc.value) !== undefined)
      .map<Incentive>((inc) => ({
        name: inc.name.trim() || null,
        type: inc.type,
        value: parseNum(inc.value) as number,
      })),
  }

  if (consumptionManual) {
    const consumption = parseNum(form.annualConsumptionKwh)
    if (consumption !== undefined) {
      input.annual_consumption_kwh = consumption
    }
  }

  return input
}

interface InputsPanelProps {
  property: PropertyDetail
}

// Accordion form precharged from the property; debounce-autosaves the estimate.
export function InputsPanel({ property }: InputsPanelProps) {
  const existing = property.estimate

  const [form, setForm] = useState<FormState>(() =>
    existing ? estimateToForm(existing) : emptyForm(),
  )
  const [estimateId, setEstimateId] = useState<number | null>(
    existing?.id ?? null,
  )
  const [status, setStatus] = useState<string | null>(existing?.status ?? null)
  const [consumptionManual, setConsumptionManual] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [saveError, setSaveError] = useState("")

  // Refs mirror the state the debounced save reads, avoiding stale closures.
  const formRef = useRef(form)
  const estimateIdRef = useRef(estimateId)
  const consumptionManualRef = useRef(consumptionManual)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bootstrapped = useRef(false)
  // True while a save is in flight, so overlapping saves re-queue (no duplicate create).
  const savingRef = useRef(false)
  // Holds the latest persistNow so scheduleSave can fire it without a dep cycle.
  const persistRef = useRef<() => void>(() => {})

  // Mirror state into refs each render so the debounced save reads current values.
  useEffect(() => {
    formRef.current = form
    estimateIdRef.current = estimateId
    consumptionManualRef.current = consumptionManual
  })

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
    }
    saveTimer.current = setTimeout(() => {
      persistRef.current()
    }, DEBOUNCE_MS)
  }, [])

  const persistNow = useCallback(async () => {
    if (savingRef.current) {
      scheduleSave()
      return
    }
    savingRef.current = true
    const input = toInput(formRef.current, consumptionManualRef.current)
    setSaveState("saving")
    setSaveError("")
    try {
      let result: Estimate
      const eid = estimateIdRef.current
      if (eid == null) {
        result = await estimatesApi.create(String(property.id), input)
        estimateIdRef.current = result.id
        setEstimateId(result.id)
      } else {
        result = await estimatesApi.update(eid, input)
      }
      setStatus(result.status)
      setSaveState("saved")
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Failed to save the estimate.",
      )
      setSaveState("error")
    } finally {
      savingRef.current = false
    }
  }, [property.id, scheduleSave])

  useEffect(() => {
    persistRef.current = () => {
      void persistNow()
    }
  }, [persistNow])

  // Bootstrap one create when no estimate exists, so consumption auto-fills.
  useEffect(() => {
    if (existing || bootstrapped.current) {
      return
    }
    bootstrapped.current = true

    let active = true
    savingRef.current = true
    setSaveState("saving")
    estimatesApi
      .create(String(property.id), {})
      .then((result) => {
        if (!active) {
          return
        }
        const synced = estimateToForm(result)
        setForm(synced)
        formRef.current = synced
        setEstimateId(result.id)
        estimateIdRef.current = result.id
        setStatus(result.status)
        setSaveState("saved")
      })
      .catch((error: unknown) => {
        if (!active) {
          return
        }
        setSaveError(
          error instanceof Error
            ? error.message
            : "Failed to initialize the estimate.",
        )
        setSaveState("error")
      })
      .finally(() => {
        savingRef.current = false
      })

    return () => {
      active = false
    }
  }, [existing, property.id])

  // Clear any pending save on unmount.
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
      }
    }
  }, [])

  const updateField = useCallback(
    (key: keyof FormState, value: FormState[keyof FormState]) => {
      setForm((prev) => ({ ...prev, [key]: value }))
      scheduleSave()
    },
    [scheduleSave],
  )

  const handleConsumptionChange = useCallback(
    (value: string) => {
      setConsumptionManual(true)
      setForm((prev) => ({ ...prev, annualConsumptionKwh: value }))
      scheduleSave()
    },
    [scheduleSave],
  )

  const updateIncentives = useCallback(
    (incentives: IncentiveRow[]) => {
      setForm((prev) => ({ ...prev, incentives }))
      scheduleSave()
    },
    [scheduleSave],
  )

  const owner = property.stakeholders.find((s) => s.role === "owner")?.company
  const industry = owner?.business_industry ?? null

  // EUI auto-fill could not be derived (no benchmark/industry/building area) and
  // the user has not yet typed a value: require manual entry.
  const consumptionMissing =
    Boolean(status) &&
    status !== "complete" &&
    form.annualConsumptionKwh.trim() === ""

  return (
    <div className="space-y-4">
      <SaveIndicator state={saveState} error={saveError} />

      <Accordion
        type="multiple"
        defaultValue={["general", "energy"]}
        className="rounded-lg border px-4"
      >
        {/* General -------------------------------------------------------- */}
        <AccordionItem value="general">
          <AccordionTrigger>General</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <ReadonlyRow label="Owner company" value={owner?.name ?? null} />
            <ReadonlyRow label="Industry" value={industry} />
            <Separator />
            <NumberField
              id="price-per-watt"
              label="Price per watt ($/W)"
              value={form.pricePerWatt}
              onChange={(v) => updateField("pricePerWatt", v)}
            />
            <NumberField
              id="blended-utility-rate"
              label="Blended utility rate ($/kWh)"
              value={form.blendedUtilityRate}
              onChange={(v) => updateField("blendedUtilityRate", v)}
            />
            <NumberField
              id="rate-escalation"
              label="Rate escalation (%/yr)"
              value={form.rateEscalationPct}
              onChange={(v) => updateField("rateEscalationPct", v)}
            />
          </AccordionContent>
        </AccordionItem>

        {/* Property (read-only) ------------------------------------------- */}
        <AccordionItem value="property">
          <AccordionTrigger>Property</AccordionTrigger>
          <AccordionContent className="space-y-3">
            <ReadonlyRow label="Address" value={property.address} />
            <ReadonlyRow
              label="Rooftop area"
              value={formatArea(property.solar_rooftop_area)}
            />
            <ReadonlyRow
              label="Building area"
              value={formatArea(property.building_area)}
            />
            <ReadonlyRow
              label="Parcel area"
              value={formatArea(property.parcel_area)}
            />
            <ReadonlyRow label="Stories" value={formatText(property.stories)} />
            <ReadonlyRow label="Zoning" value={formatText(property.zoning)} />
            <ReadonlyRow
              label="Parcel use"
              value={formatText(property.parcel_use)}
            />
            <ReadonlyRow
              label="Year built"
              value={formatText(property.structure_year_built)}
            />
          </AccordionContent>
        </AccordionItem>

        {/* Energy Usage -------------------------------------------------- */}
        <AccordionItem value="energy">
          <AccordionTrigger>Energy Usage</AccordionTrigger>
          <AccordionContent className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="annual-consumption">
                  Annual energy consumption (kWh)
                </Label>
                {!consumptionMissing && form.annualConsumptionKwh.trim() !== "" && (
                  <Badge variant={consumptionManual ? "default" : "secondary"}>
                    {consumptionManual ? "Manual" : "Estimated"}
                  </Badge>
                )}
              </div>
              <Input
                id="annual-consumption"
                type="number"
                inputMode="decimal"
                value={form.annualConsumptionKwh}
                aria-required={consumptionMissing}
                onChange={(e) => handleConsumptionChange(e.target.value)}
              />
              {!consumptionMissing && !consumptionManual && (
                <p className="text-xs text-muted-foreground">
                  Auto-filled from Building Area × industry EUI. Edit to override.
                </p>
              )}
              {consumptionMissing && (
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertTitle>Consumption could not be estimated</AlertTitle>
                  <AlertDescription>
                    No EUI benchmark is available for this property
                    {industry ? ` (industry: ${industry})` : ""}. Enter the
                    annual energy consumption manually to continue.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* PV System ------------------------------------------------------ */}
        <AccordionItem value="pv">
          <AccordionTrigger>PV System</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <NumberField
              id="system-size"
              label="System size (kW)"
              value={form.systemSizeKw}
              onChange={(v) => updateField("systemSizeKw", v)}
            />
            <NumberField
              id="system-losses"
              label="System losses (%)"
              value={form.systemLossesPct}
              onChange={(v) => updateField("systemLossesPct", v)}
            />
            <NumberField
              id="shading"
              label="Shading (%)"
              value={form.shadingPct}
              onChange={(v) => updateField("shadingPct", v)}
            />
          </AccordionContent>
        </AccordionItem>

        {/* Include BESS -------------------------------------------------- */}
        <AccordionItem value="bess">
          <AccordionTrigger>Include BESS</AccordionTrigger>
          <AccordionContent>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="include-bess" className="font-normal">
                Include battery energy storage (BESS)
              </Label>
              <Switch
                id="include-bess"
                checked={form.includeBess}
                onCheckedChange={(checked) =>
                  updateField("includeBess", checked)
                }
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Applicable Incentives ----------------------------------------- */}
        <AccordionItem value="incentives">
          <AccordionTrigger>Applicable Incentives</AccordionTrigger>
          <AccordionContent className="space-y-3">
            {form.incentives.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No incentives added yet.
              </p>
            )}
            {form.incentives.map((incentive, index) => (
              <div
                key={incentive.uid}
                className="flex flex-wrap items-end gap-2 rounded-md border p-3"
              >
                <div className="flex-1 space-y-1">
                  <Label
                    htmlFor={`incentive-name-${index}`}
                    className="text-xs"
                  >
                    Name
                  </Label>
                  <Input
                    id={`incentive-name-${index}`}
                    value={incentive.name}
                    placeholder="e.g. Federal ITC"
                    onChange={(e) =>
                      updateIncentives(
                        form.incentives.map((inc, i) =>
                          i === index ? { ...inc, name: e.target.value } : inc,
                        ),
                      )
                    }
                  />
                </div>
                <div className="w-32 space-y-1">
                  <Label className="text-xs">Type</Label>
                  <Select
                    value={incentive.type}
                    onValueChange={(value) =>
                      updateIncentives(
                        form.incentives.map((inc, i) =>
                          i === index
                            ? {
                                ...inc,
                                type: value as IncentiveRow["type"],
                              }
                            : inc,
                        ),
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage</SelectItem>
                      <SelectItem value="fixed">Fixed ($)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-32 space-y-1">
                  <Label
                    htmlFor={`incentive-value-${index}`}
                    className="text-xs"
                  >
                    {incentive.type === "percentage"
                      ? "Value (0–1)"
                      : "Value ($)"}
                  </Label>
                  <Input
                    id={`incentive-value-${index}`}
                    type="number"
                    inputMode="decimal"
                    value={incentive.value}
                    onChange={(e) =>
                      updateIncentives(
                        form.incentives.map((inc, i) =>
                          i === index
                            ? { ...inc, value: e.target.value }
                            : inc,
                        ),
                      )
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove incentive"
                  onClick={() =>
                    updateIncentives(
                      form.incentives.filter((_, i) => i !== index),
                    )
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                updateIncentives([...form.incentives, newIncentiveRow()])
              }
            >
              <Plus className="size-4" />
              Add incentive
            </Button>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}

/** A labeled numeric input wired for autosave. */
function NumberField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

/** A read-only label/value row for precharged property context. */
function ReadonlyRow({
  label,
  value,
}: {
  label: string
  value: string | null
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value || "—"}</span>
    </div>
  )
}

/** A compact, accessible autosave status line. */
function SaveIndicator({ state, error }: { state: SaveState; error: string }) {
  if (state === "error") {
    return (
      <p className="text-sm text-destructive" role="alert">
        {error || "Failed to save the estimate."}
      </p>
    )
  }

  const text =
    state === "saving" ? "Saving…" : state === "saved" ? "All changes saved" : ""

  return (
    <p className="h-5 text-sm text-muted-foreground" aria-live="polite">
      {text}
    </p>
  )
}
