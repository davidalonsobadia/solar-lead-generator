"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, FileDown, Save, Share2, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { ResultsPanel } from "@/components/estimate/results-panel"
import { config } from "@/lib/config"
import {
  estimatesApi,
  type Estimate,
  type EstimateInput,
  type PropertyDetail,
} from "@/features/estimates/api"

// How long to wait after the last slider move before recalculating via PUT.
const DEBOUNCE_MS = 600

// Square feet of rooftop per kW of installed commercial PV (rule of thumb).
// Used only to cap the System Size slider at the property's rooftop capacity.
const FT2_PER_KW = 100

// System size slider hard bounds (kW). The upper bound is further capped at the
// rooftop capacity derived from the measured rooftop area (see effectiveSizeMax).
const SIZE_MIN_KW = 50
const SIZE_MAX_KW = 250

// Bounds for the remaining sliders. Price, shading and system size carry the
// ranges called out by the issue; utility rate and escalation use sensible
// commercial defaults.
const PRICE = { min: 2.5, max: 5.0, step: 0.05 }
const SHADING = { min: 0, max: 30, step: 1 }
const UTILITY_RATE = { min: 0.05, max: 0.5, step: 0.01 }
const ESCALATION = { min: 0, max: 10, step: 0.1 }

// Annual consumption varies hugely between properties, so its ceiling adapts to
// the persisted value (twice the seed, with a floor) and it steps in 1 MWh.
const CONSUMPTION_STEP = 1_000
const CONSUMPTION_FLOOR_MAX = 250_000

type Numeric = number | string | null

/** The six slider-driven inputs, kept as finite numbers. */
interface SliderForm {
  pricePerWatt: number
  systemSizeKw: number
  shadingPct: number
  blendedUtilityRate: number
  rateEscalationPct: number
  annualConsumptionKwh: number
}

type FieldKey = keyof SliderForm

type SaveState = "idle" | "saving" | "saved" | "error"

/** Coerce a backend numeric (number or string) to a finite number, or null. */
function toNum(value: Numeric): number | null {
  if (value === null || value === undefined || value === "") {
    return null
  }
  const num = typeof value === "string" ? Number(value) : value
  return Number.isFinite(num) ? num : null
}

/** Clamp `value` into the inclusive `[min, max]` range. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

interface AdjustSlidersProps {
  property: PropertyDetail
}

/**
 * Adjust-estimate sliders. Each (debounced) change recalculates the estimate
 * through `PUT /api/v1/estimates/{id}` — the recalculate endpoint reuses the
 * cached Google Solar result, so moving a slider never triggers a Solar lookup.
 * The live estimate is fed straight into {@link ResultsPanel} so the economics
 * and parcel map update in place.
 */
export function AdjustSliders({ property }: AdjustSlidersProps) {
  const [estimate, setEstimate] = useState<Estimate | null>(property.estimate)
  const estimateId = estimate?.id ?? null

  // The maximum installable size: hard cap, further limited by rooftop area.
  const effectiveSizeMax = useMemo(() => {
    const rooftopFt2 = toNum(property.solar_rooftop_area)
    if (rooftopFt2 === null || rooftopFt2 <= 0) {
      return SIZE_MAX_KW
    }
    const rooftopKw = rooftopFt2 / FT2_PER_KW
    return clamp(rooftopKw, SIZE_MIN_KW, SIZE_MAX_KW)
  }, [property.solar_rooftop_area])

  const [form, setForm] = useState<SliderForm>(() =>
    seedForm(property.estimate, effectiveSizeMax),
  )

  const consumptionMax = useMemo(
    () =>
      Math.max(
        Math.ceil((form.annualConsumptionKwh * 2) / CONSUMPTION_STEP) *
          CONSUMPTION_STEP,
        CONSUMPTION_FLOOR_MAX,
      ),
    // Seed the ceiling once from the initial consumption; widening it as the
    // user drags would let the thumb "run away" from the cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [saveError, setSaveError] = useState("")
  const [shareNote, setShareNote] = useState("")

  // Refs mirror the state the debounced save reads, avoiding stale closures.
  const formRef = useRef(form)
  const estimateIdRef = useRef(estimateId)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingRef = useRef(false)
  const persistRef = useRef<() => void>(() => {})
  // Fields the user has moved this session. Together with the persisted values
  // this decides which inputs are safe to send (see buildInput).
  const touchedRef = useRef<Set<FieldKey>>(new Set())

  // The two nullable inputs are only sent once they hold a real value, so a
  // recalc never zeroes an auto-filled consumption nor overrides the solar
  // default system size before the user opts in.
  const hadSize = toNum(property.estimate?.system_size_kw ?? null) !== null
  const hadConsumption =
    toNum(property.estimate?.annual_consumption_kwh ?? null) !== null

  useEffect(() => {
    formRef.current = form
    estimateIdRef.current = estimateId
  })

  const buildInput = useCallback((): EstimateInput => {
    const current = formRef.current
    const touched = touchedRef.current
    const input: EstimateInput = {
      price_per_watt: current.pricePerWatt,
      shading_pct: current.shadingPct,
      blended_utility_rate: current.blendedUtilityRate,
      rate_escalation_pct: current.rateEscalationPct,
    }
    if (touched.has("systemSizeKw") || hadSize) {
      input.system_size_kw = current.systemSizeKw
    }
    if (touched.has("annualConsumptionKwh") || hadConsumption) {
      input.annual_consumption_kwh = current.annualConsumptionKwh
    }
    return input
  }, [hadSize, hadConsumption])

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
    }
    saveTimer.current = setTimeout(() => {
      persistRef.current()
    }, DEBOUNCE_MS)
  }, [])

  const persistNow = useCallback(async () => {
    const eid = estimateIdRef.current
    if (eid == null) {
      return
    }
    // Re-queue rather than overlap an in-flight recalc.
    if (savingRef.current) {
      scheduleSave()
      return
    }
    savingRef.current = true
    setSaveState("saving")
    setSaveError("")
    try {
      const result = await estimatesApi.update(eid, buildInput())
      setEstimate(result)
      setSaveState("saved")
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Failed to recalculate the estimate.",
      )
      setSaveState("error")
    } finally {
      savingRef.current = false
    }
  }, [buildInput, scheduleSave])

  useEffect(() => {
    persistRef.current = () => {
      void persistNow()
    }
  }, [persistNow])

  // Clear any pending recalc on unmount.
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
      }
    }
  }, [])

  const updateField = useCallback(
    (key: FieldKey, value: number) => {
      touchedRef.current.add(key)
      setForm((prev) => ({ ...prev, [key]: value }))
      scheduleSave()
    },
    [scheduleSave],
  )

  // Save flushes the pending recalc immediately instead of waiting out the debounce.
  const handleSave = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    persistRef.current()
  }, [])

  const handleShare = useCallback(() => {
    const url =
      typeof window !== "undefined"
        ? window.location.href
        : config.routes.propertyEstimate(String(property.id))
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard
        .writeText(url)
        .then(() => setShareNote("Link copied to clipboard."))
        .catch(() => setShareNote("Could not copy the link."))
    } else {
      setShareNote("Copy this page's URL to share the estimate.")
    }
  }, [property.id])

  const liveProperty = useMemo(
    () => ({ ...property, estimate }),
    [property, estimate],
  )

  const disabled = estimateId == null

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Adjust estimate</CardTitle>
          <CardDescription>
            Fine-tune the assumptions. Changes recalculate the economics below —
            no new solar lookup is performed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {disabled && (
            <p className="text-sm text-muted-foreground" role="status">
              Save the inputs above to create an estimate, then reload to adjust
              it here.
            </p>
          )}

          <SliderRow
            id="adjust-price-per-watt"
            label="Price per watt"
            display={`$${form.pricePerWatt.toFixed(2)}/W`}
            value={form.pricePerWatt}
            min={PRICE.min}
            max={PRICE.max}
            step={PRICE.step}
            disabled={disabled}
            onChange={(v) => updateField("pricePerWatt", v)}
          />
          <SliderRow
            id="adjust-system-size"
            label="System size"
            display={`${Math.round(form.systemSizeKw)} kW`}
            value={clamp(form.systemSizeKw, SIZE_MIN_KW, effectiveSizeMax)}
            min={SIZE_MIN_KW}
            max={effectiveSizeMax}
            step={1}
            disabled={disabled}
            hint={`Capped at the rooftop capacity (≈${Math.round(effectiveSizeMax)} kW).`}
            onChange={(v) => updateField("systemSizeKw", v)}
          />
          <SliderRow
            id="adjust-shading"
            label="Shading"
            display={`${Math.round(form.shadingPct)}%`}
            value={form.shadingPct}
            min={SHADING.min}
            max={SHADING.max}
            step={SHADING.step}
            disabled={disabled}
            onChange={(v) => updateField("shadingPct", v)}
          />
          <SliderRow
            id="adjust-utility-rate"
            label="Blended utility rate"
            display={`$${form.blendedUtilityRate.toFixed(2)}/kWh`}
            value={form.blendedUtilityRate}
            min={UTILITY_RATE.min}
            max={UTILITY_RATE.max}
            step={UTILITY_RATE.step}
            disabled={disabled}
            onChange={(v) => updateField("blendedUtilityRate", v)}
          />
          <SliderRow
            id="adjust-rate-escalation"
            label="Rate escalation"
            display={`${form.rateEscalationPct.toFixed(1)}%/yr`}
            value={form.rateEscalationPct}
            min={ESCALATION.min}
            max={ESCALATION.max}
            step={ESCALATION.step}
            disabled={disabled}
            onChange={(v) => updateField("rateEscalationPct", v)}
          />
          <SliderRow
            id="adjust-consumption"
            label="Annual consumption"
            display={`${Math.round(form.annualConsumptionKwh).toLocaleString()} kWh`}
            value={clamp(form.annualConsumptionKwh, 0, consumptionMax)}
            min={0}
            max={consumptionMax}
            step={CONSUMPTION_STEP}
            disabled={disabled}
            onChange={(v) => updateField("annualConsumptionKwh", v)}
          />

          <Separator />

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href={config.routes.results}>
                <ArrowLeft className="size-4" />
                Back
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 className="size-4" />
              Share
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              title="PDF export is planned (EXP-01)."
            >
              {/* Export PDF is a stub until EXP-01 lands. */}
              <a href="#exp-01" aria-disabled="true">
                <FileDown className="size-4" />
                Export PDF
              </a>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSave}
              disabled={disabled || saveState === "saving"}
            >
              <Save className="size-4" />
              Save
            </Button>
            <Button asChild size="sm" className="ml-auto">
              <Link href={config.routes.results}>
                <Users className="size-4" />
                Get Leads
              </Link>
            </Button>
          </div>

          <SaveIndicator state={saveState} error={saveError} note={shareNote} />
        </CardContent>
      </Card>

      <ResultsPanel property={liveProperty} />
    </div>
  )
}

/** Seed the slider form from a persisted estimate, clamped into each range. */
function seedForm(
  estimate: Estimate | null,
  effectiveSizeMax: number,
): SliderForm {
  const price = toNum(estimate?.price_per_watt ?? null)
  const size = toNum(estimate?.system_size_kw ?? null)
  const shading = toNum(estimate?.shading_pct ?? null)
  const rate = toNum(estimate?.blended_utility_rate ?? null)
  const escalation = toNum(estimate?.rate_escalation_pct ?? null)
  const consumption = toNum(estimate?.annual_consumption_kwh ?? null)

  return {
    pricePerWatt: clamp(price ?? 3.0, PRICE.min, PRICE.max),
    // No persisted size means the backend used the rooftop-derived default;
    // start the slider at that cap so it reflects the modeled system.
    systemSizeKw: clamp(size ?? effectiveSizeMax, SIZE_MIN_KW, effectiveSizeMax),
    shadingPct: clamp(shading ?? 0, SHADING.min, SHADING.max),
    blendedUtilityRate: clamp(rate ?? 0.2, UTILITY_RATE.min, UTILITY_RATE.max),
    rateEscalationPct: clamp(
      escalation ?? 2.5,
      ESCALATION.min,
      ESCALATION.max,
    ),
    annualConsumptionKwh: Math.max(consumption ?? 0, 0),
  }
}

interface SliderRowProps {
  id: string
  label: string
  display: string
  value: number
  min: number
  max: number
  step: number
  disabled?: boolean
  hint?: string
  onChange: (value: number) => void
}

/** A labeled slider row with its current value and an optional hint. */
function SliderRow({
  id,
  label,
  display,
  value,
  min,
  max,
  step,
  disabled,
  hint,
  onChange,
}: SliderRowProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-sm font-medium tabular-nums">{display}</span>
      </div>
      <Slider
        id={id}
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(values) => onChange(values[0])}
        aria-label={label}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** A compact, accessible status line for recalc and share feedback. */
function SaveIndicator({
  state,
  error,
  note,
}: {
  state: SaveState
  error: string
  note: string
}) {
  if (state === "error") {
    return (
      <p className="text-sm text-destructive" role="alert">
        {error || "Failed to recalculate the estimate."}
      </p>
    )
  }

  const text =
    state === "saving"
      ? "Recalculating…"
      : state === "saved"
        ? "All changes saved"
        : note

  return (
    <p className="h-5 text-sm text-muted-foreground" aria-live="polite">
      {text}
    </p>
  )
}
