"use client"

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import Link from "next/link"
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FileDown,
  FileText,
  MapPin,
  Plus,
  Save,
  Share2,
  Trash2,
  Users,
  Zap,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { config } from "@/lib/config"
import { loadGoogleMaps } from "@/lib/google-maps"
import { cn } from "@/lib/utils"
import {
  estimatesApi,
  type Estimate,
  type Incentive,
  type EstimateInput,
  type PropertyDetail,
} from "@/features/estimates/api"

// ─── Constants ────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 700
const FT2_PER_KW = 100
const SIZE_MIN_KW = 50
const SIZE_MAX_KW = 250
const PRICE = { min: 2.5, max: 5.0, step: 0.05 }
const SHADING = { min: 0, max: 30, step: 1 }
const METERS_PER_DEGREE_LAT = 111_320
const SQFT_TO_SQM = 0.092903

// ─── Types ────────────────────────────────────────────────────────────────────

type Numeric = number | string | null
type SaveState = "idle" | "saving" | "saved" | "error"

interface IncentiveRow {
  uid: string
  name: string
  type: "percentage" | "fixed"
  value: string
}

function newIncentiveRow(): IncentiveRow {
  return { uid: crypto.randomUUID(), name: "", type: "percentage", value: "" }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNum(value: Numeric): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = typeof value === "string" ? Number(value) : value
  return Number.isFinite(n) ? n : null
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max)
}

function numToStr(value: Numeric): string {
  if (value === null || value === undefined || value === "") return ""
  const n = typeof value === "string" ? Number(value) : value
  return Number.isFinite(n) ? String(n) : ""
}

function parseNum(s: string): number | undefined {
  const t = s.trim()
  if (!t) return undefined
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}

function fmtDollars(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`
  return `$${Math.round(v).toLocaleString("en-US")}`
}

function fmtCurrencyFull(v: number): string {
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  })
}

function fmtArea(value: Numeric): string {
  const s = numToStr(value)
  if (!s) return "—"
  return `${Math.round(Number(s)).toLocaleString()} ft²`
}

function fmtText(v: Numeric | number | string | null): string {
  if (v === null || v === undefined || v === "") return "—"
  return String(v)
}

function seedSliders(
  estimate: Estimate | null,
  sizeMax: number,
): { price: number; size: number; shading: number } {
  const price = toNum(estimate?.price_per_watt ?? null)
  const size = toNum(estimate?.system_size_kw ?? null)
  const shading = toNum(estimate?.shading_pct ?? null)
  return {
    price: clamp(price ?? 3.1, PRICE.min, PRICE.max),
    size: clamp(size ?? sizeMax, SIZE_MIN_KW, sizeMax),
    shading: clamp(shading ?? 8, SHADING.min, SHADING.max),
  }
}

// ─── Main shell ───────────────────────────────────────────────────────────────

interface EstimateShellProps {
  property: PropertyDetail
}

export function EstimateShell({ property }: EstimateShellProps) {
  // Derived display name
  const owner = property.stakeholders.find((s) => s.role === "owner")?.company
  const companyName = owner?.name ?? property.address ?? `Property #${property.id}`
  const industry = owner?.business_industry ?? null

  // Rooftop-capacity cap for the size slider
  const sizeMax = useMemo(() => {
    const ft2 = toNum(property.solar_rooftop_area)
    if (!ft2 || ft2 <= 0) return SIZE_MAX_KW
    return clamp(ft2 / FT2_PER_KW, SIZE_MIN_KW, SIZE_MAX_KW)
  }, [property.solar_rooftop_area])

  // ── Shared estimate state ────────────────────────────────────────────────
  const [estimate, setEstimate] = useState<Estimate | null>(property.estimate)
  const [estimateId, setEstimateId] = useState<number | null>(
    property.estimate?.id ?? null,
  )

  // ── Slider state (right panel) ───────────────────────────────────────────
  const [sliders, setSliders] = useState(() =>
    seedSliders(property.estimate, sizeMax),
  )

  // ── Left-panel interactive state ─────────────────────────────────────────
  const [includeBess, setIncludeBess] = useState(
    Boolean(property.estimate?.include_bess),
  )
  const [incentives, setIncentives] = useState<IncentiveRow[]>(() =>
    (property.estimate?.incentives ?? []).map((inc) => ({
      uid: crypto.randomUUID(),
      name: inc.name ?? "",
      type: inc.type === "fixed" ? "fixed" : "percentage",
      value: numToStr(inc.value),
    })),
  )
  const [annualConsumptionKwh, setAnnualConsumptionKwh] = useState(
    numToStr(property.estimate?.annual_consumption_kwh ?? null),
  )
  const [consumptionManual, setConsumptionManual] = useState(false)

  // ── Advanced controls visibility ─────────────────────────────────────────
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [advancedRate, setAdvancedRate] = useState(
    toNum(property.estimate?.blended_utility_rate ?? null) ?? 0.2,
  )
  const [advancedEscalation, setAdvancedEscalation] = useState(
    toNum(property.estimate?.rate_escalation_pct ?? null) ?? 2.5,
  )

  // ── Save state ───────────────────────────────────────────────────────────
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [saveError, setSaveError] = useState("")
  const [shareNote, setShareNote] = useState("")

  // ── Accordion open state (left panel) ───────────────────────────────────
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(["general", "pv"]),
  )

  // ── Refs (avoid stale closures in debounced save) ────────────────────────
  const slidersRef = useRef(sliders)
  const includeBessRef = useRef(includeBess)
  const incentivesRef = useRef(incentives)
  const consumptionRef = useRef(annualConsumptionKwh)
  const consumptionManualRef = useRef(consumptionManual)
  const advancedRateRef = useRef(advancedRate)
  const advancedEscalationRef = useRef(advancedEscalation)
  const estimateIdRef = useRef(estimateId)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingRef = useRef(false)
  const persistRef = useRef<() => void>(() => {})
  const bootstrapped = useRef(false)

  // Mirror state into refs each render
  useEffect(() => {
    slidersRef.current = sliders
    includeBessRef.current = includeBess
    incentivesRef.current = incentives
    consumptionRef.current = annualConsumptionKwh
    consumptionManualRef.current = consumptionManual
    advancedRateRef.current = advancedRate
    advancedEscalationRef.current = advancedEscalation
    estimateIdRef.current = estimateId
  })

  // ── Build input payload ──────────────────────────────────────────────────
  const buildInput = useCallback((): EstimateInput => {
    const s = slidersRef.current
    const input: EstimateInput = {
      price_per_watt: s.price,
      system_size_kw: s.size,
      shading_pct: s.shading,
      include_bess: includeBessRef.current,
      blended_utility_rate: advancedRateRef.current,
      rate_escalation_pct: advancedEscalationRef.current,
      incentives: incentivesRef.current
        .filter((inc) => parseNum(inc.value) !== undefined)
        .map<Incentive>((inc) => ({
          name: inc.name.trim() || null,
          type: inc.type,
          value: parseNum(inc.value) as number,
        })),
    }
    if (consumptionManualRef.current) {
      const c = parseNum(consumptionRef.current)
      if (c !== undefined) input.annual_consumption_kwh = c
    }
    return input
  }, [])

  // ── Debounced persist ────────────────────────────────────────────────────
  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => persistRef.current(), DEBOUNCE_MS)
  }, [])

  const persistNow = useCallback(async () => {
    if (savingRef.current) {
      scheduleSave()
      return
    }
    savingRef.current = true
    setSaveState("saving")
    setSaveError("")
    try {
      const input = buildInput()
      let result: Estimate
      const eid = estimateIdRef.current
      if (eid == null) {
        result = await estimatesApi.create(String(property.id), input)
        estimateIdRef.current = result.id
        setEstimateId(result.id)
      } else {
        result = await estimatesApi.update(eid, input)
      }
      setEstimate(result)
      setSaveState("saved")
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save the estimate.",
      )
      setSaveState("error")
    } finally {
      savingRef.current = false
    }
  }, [buildInput, property.id, scheduleSave])

  useEffect(() => {
    persistRef.current = () => {
      void persistNow()
    }
  }, [persistNow])

  // Bootstrap: create estimate on first load when none exists
  useEffect(() => {
    if (property.estimate || bootstrapped.current) return
    bootstrapped.current = true
    savingRef.current = true
    setSaveState("saving")
    estimatesApi
      .create(String(property.id), {})
      .then((result) => {
        setEstimate(result)
        setEstimateId(result.id)
        estimateIdRef.current = result.id
        const s = seedSliders(result, sizeMax)
        setSliders(s)
        setAnnualConsumptionKwh(numToStr(result.annual_consumption_kwh))
        setIncludeBess(Boolean(result.include_bess))
        setSaveState("saved")
      })
      .catch((err: unknown) => {
        setSaveError(
          err instanceof Error
            ? err.message
            : "Failed to initialize the estimate.",
        )
        setSaveState("error")
      })
      .finally(() => {
        savingRef.current = false
      })
  }, [property.estimate, property.id, sizeMax])

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  // ── Event handlers ───────────────────────────────────────────────────────
  const handleSliderChange = useCallback(
    (key: "price" | "size" | "shading", v: number) => {
      setSliders((prev) => ({ ...prev, [key]: v }))
      scheduleSave()
    },
    [scheduleSave],
  )

  const handleBessChange = useCallback(
    (checked: boolean) => {
      setIncludeBess(checked)
      scheduleSave()
    },
    [scheduleSave],
  )

  const handleIncentivesChange = useCallback(
    (rows: IncentiveRow[]) => {
      setIncentives(rows)
      scheduleSave()
    },
    [scheduleSave],
  )

  const handleConsumptionChange = useCallback(
    (v: string) => {
      setConsumptionManual(true)
      setAnnualConsumptionKwh(v)
      scheduleSave()
    },
    [scheduleSave],
  )

  const handleAdvancedRate = useCallback(
    (v: number) => {
      setAdvancedRate(v)
      scheduleSave()
    },
    [scheduleSave],
  )

  const handleAdvancedEscalation = useCallback(
    (v: number) => {
      setAdvancedEscalation(v)
      scheduleSave()
    },
    [scheduleSave],
  )

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
        .then(() => setShareNote("Link copied!"))
        .catch(() => setShareNote("Could not copy."))
    } else {
      setShareNote("Copy the URL to share.")
    }
  }, [property.id])

  const toggleSection = (key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const disabled = estimateId == null

  const activeIncentivesCount = incentives.filter(
    (inc) => parseNum(inc.value) !== undefined,
  ).length

  const liveProperty = useMemo(() => ({ ...property, estimate }), [property, estimate])

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: "#F4F7F8" }}
    >
      {/* ── Top breadcrumb bar ── */}
      <div
        className="flex items-center justify-between px-6 py-3 border-b bg-white"
        style={{ borderColor: "#EAEFF0" }}
      >
        <div className="flex items-center gap-1.5 text-sm text-[#5F7378]">
          <Link
            href={config.routes.results}
            className="flex items-center gap-1 hover:text-[#0D4E5E] transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Rooftop Results
          </Link>
          <ChevronRight className="h-3.5 w-3.5 opacity-50" />
          <span className="text-[#102830] font-medium">Project Estimator</span>
        </div>
        <LiveBadge state={saveState} />
      </div>

      {/* ── Two-column body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ═══ LEFT PANEL ═══ */}
        <aside
          className="w-[400px] min-w-[400px] bg-white border-r overflow-y-auto flex flex-col"
          style={{ borderColor: "#EAEFF0" }}
        >
          {/* Title */}
          <div className="px-6 pt-6 pb-4">
            <h1
              className="text-2xl font-bold text-[#102830]"
              style={{
                fontFamily:
                  "var(--font-inter-tight, 'Inter Tight', sans-serif)",
              }}
            >
              Project Estimator
            </h1>
          </div>

          {/* ── General Information ── */}
          <Section
            label="General Information"
            icon={<span className="text-sm">🏢</span>}
            open={openSections.has("general")}
            onToggle={() => toggleSection("general")}
          >
            <p className="text-xl font-bold text-[#102830] mb-0.5">
              {companyName}
            </p>
            {property.address && (
              <p className="flex items-start gap-1.5 text-sm text-[#5F7378] mb-4">
                <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {property.address}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <InfoChip label="INDUSTRY" value={industry ?? "—"} />
              <InfoChip
                label="LEADS FOUND"
                value={String(property.leads_count)}
              />
            </div>
          </Section>

          {/* ── Property Information ── */}
          <Section
            label="Property Information"
            icon={<span className="text-sm">🏠</span>}
            open={openSections.has("property")}
            onToggle={() => toggleSection("property")}
          >
            <div className="space-y-2">
              <ReadRow label="Address" value={property.address} />
              <ReadRow label="Rooftop area" value={fmtArea(property.solar_rooftop_area)} />
              <ReadRow label="Building area" value={fmtArea(property.building_area)} />
              <ReadRow label="Parcel area" value={fmtArea(property.parcel_area)} />
              <ReadRow label="Stories" value={fmtText(property.stories)} />
              <ReadRow label="Zoning" value={fmtText(property.zoning)} />
              <ReadRow label="Parcel use" value={fmtText(property.parcel_use)} />
              <ReadRow label="Year built" value={fmtText(property.structure_year_built)} />
              <ReadRow label="APN" value={fmtText(property.apn)} />
            </div>
          </Section>

          {/* ── Energy Usage Information ── */}
          <Section
            label="Energy Usage Information"
            icon={<Zap className="h-4 w-4 text-[#5F7378]" />}
            open={openSections.has("energy")}
            onToggle={() => toggleSection("energy")}
          >
            <div className="space-y-3">
              <ReadRow
                label="Annual consumption"
                value={
                  estimate?.annual_consumption_kwh
                    ? `${Math.round(Number(estimate.annual_consumption_kwh)).toLocaleString()} kWh/yr`
                    : "—"
                }
              />
              <ReadRow
                label="Utility rate"
                value={`$${advancedRate.toFixed(2)}/kWh`}
              />
              <ReadRow
                label="Rate escalation"
                value={`${advancedEscalation.toFixed(1)}%/yr`}
              />
              <div className="pt-1">
                <Label
                  htmlFor="consumption-input"
                  className="text-xs text-[#5F7378] mb-1.5 block"
                >
                  Override annual consumption (kWh)
                </Label>
                <Input
                  id="consumption-input"
                  type="number"
                  inputMode="decimal"
                  value={annualConsumptionKwh}
                  placeholder="Auto-filled from EUI benchmark"
                  className="h-8 text-sm"
                  onChange={(e) => handleConsumptionChange(e.target.value)}
                />
                {!consumptionManual && annualConsumptionKwh && (
                  <p className="text-xs text-[#5F7378] mt-1">
                    Auto-filled from building area × industry EUI.
                  </p>
                )}
              </div>
            </div>
          </Section>

          {/* ── PV System ── */}
          <Section
            label="PV System"
            icon={
              <svg
                className="h-4 w-4 text-[#5F7378]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
            }
            open={openSections.has("pv")}
            onToggle={() => toggleSection("pv")}
          >
            <div className="space-y-0">
              <PVRow
                label="PV System Size"
                value={
                  estimate?.system_size_kw
                    ? `${Math.round(Number(estimate.system_size_kw))} kW-DC`
                    : `${Math.round(sliders.size)} kW-DC`
                }
                highlighted
              />
              <PVRow
                label="Annual Production"
                value={
                  estimate?.annual_production_kwh
                    ? `${Math.round(Number(estimate.annual_production_kwh)).toLocaleString()} kWh/yr`
                    : "—"
                }
              />
              <div className="grid grid-cols-2">
                <PVRow
                  label="System Losses"
                  value={
                    estimate?.system_losses_pct
                      ? `${Number(estimate.system_losses_pct).toFixed(1)}%`
                      : "14.0%"
                  }
                  muted
                />
                <PVRow
                  label="Shading Losses"
                  value={`${Math.round(sliders.shading)}%`}
                  muted
                />
                <PVRow
                  label="Price Per Watt"
                  value={`$${sliders.price.toFixed(2)}/W`}
                  muted
                />
                <PVRow
                  label="System Cost"
                  value={
                    estimate?.system_cost
                      ? fmtCurrencyFull(Number(estimate.system_cost))
                      : "—"
                  }
                  muted
                />
              </div>

              {/* Include BESS */}
              <div className="flex items-center justify-between gap-4 py-3 border-t mt-2"
                style={{ borderColor: "#EAEFF0" }}>
                <div>
                  <p className="text-sm font-medium text-[#102830]">
                    Include BESS
                  </p>
                  <p className="text-xs text-[#5F7378]">
                    Battery energy storage system
                  </p>
                </div>
                <Switch
                  id="include-bess"
                  checked={includeBess}
                  onCheckedChange={handleBessChange}
                  disabled={disabled}
                />
              </div>
            </div>
          </Section>

          {/* ── Applicable Incentives ── */}
          <Section
            label="Applicable Incentives"
            icon={<span className="text-sm">$</span>}
            open={openSections.has("incentives")}
            onToggle={() => toggleSection("incentives")}
            badge={
              activeIncentivesCount > 0 ? (
                <span className="ml-2 text-xs font-semibold text-[#0D4E5E] bg-[#E4F4F7] rounded-full px-2 py-0.5">
                  {activeIncentivesCount} active
                </span>
              ) : null
            }
          >
            <div className="space-y-3">
              {incentives.length === 0 && (
                <p className="text-sm text-[#5F7378]">No incentives added yet.</p>
              )}
              {incentives.map((inc, idx) => (
                <div
                  key={inc.uid}
                  className="flex flex-wrap items-end gap-2 rounded-xl border p-3"
                  style={{ borderColor: "#EAEFF0" }}
                >
                  <div className="flex-1 space-y-1 min-w-[100px]">
                    <Label className="text-xs text-[#5F7378]">Name</Label>
                    <Input
                      value={inc.name}
                      placeholder="e.g. Federal ITC"
                      className="h-8 text-sm"
                      onChange={(e) =>
                        handleIncentivesChange(
                          incentives.map((r, i) =>
                            i === idx ? { ...r, name: e.target.value } : r,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="w-28 space-y-1">
                    <Label className="text-xs text-[#5F7378]">Type</Label>
                    <Select
                      value={inc.type}
                      onValueChange={(v) =>
                        handleIncentivesChange(
                          incentives.map((r, i) =>
                            i === idx
                              ? { ...r, type: v as IncentiveRow["type"] }
                              : r,
                          ),
                        )
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">%</SelectItem>
                        <SelectItem value="fixed">$ Fixed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-24 space-y-1">
                    <Label className="text-xs text-[#5F7378]">
                      {inc.type === "percentage" ? "Value (0–1)" : "Value ($)"}
                    </Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={inc.value}
                      className="h-8 text-sm"
                      onChange={(e) =>
                        handleIncentivesChange(
                          incentives.map((r, i) =>
                            i === idx ? { ...r, value: e.target.value } : r,
                          ),
                        )
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() =>
                      handleIncentivesChange(incentives.filter((_, i) => i !== idx))
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  handleIncentivesChange([...incentives, newIncentiveRow()])
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Add incentive
              </Button>
            </div>
          </Section>
        </aside>

        {/* ═══ RIGHT PANEL ═══ */}
        <main
          className="flex-1 overflow-y-auto p-6 space-y-5"
          style={{ minWidth: 0 }}
        >
          {/* ── Parcel map ── */}
          <ParcelMap
            lat={toNum(property.lat)}
            lon={toNum(property.lon)}
            parcelAreaFt2={toNum(property.parcel_area)}
            rooftopAreaFt2={toNum(property.solar_rooftop_area)}
            systemSizeKw={
              estimate ? toNum(estimate.system_size_kw) : sliders.size
            }
          />

          {/* ── Project Economics ── */}
          <div
            className="bg-white rounded-2xl p-5"
            style={{
              border: "1px solid #EAEFF0",
              boxShadow: "0 1px 2px rgba(16,42,48,0.04)",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-[#102830]">
                Project Economics
              </h2>
              <span className="text-xs text-[#5F7378]">
                {saveState === "saving"
                  ? "Updating…"
                  : "Updates live"}
                {activeIncentivesCount > 0
                  ? ` · ${activeIncentivesCount} incentive${activeIncentivesCount !== 1 ? "s" : ""} applied`
                  : ""}
              </span>
            </div>
            <EconomicsGrid estimate={estimate} />
          </div>

          {/* ── Adjust Estimate sliders ── */}
          <div
            className="bg-white rounded-2xl p-5"
            style={{
              border: "1px solid #EAEFF0",
              boxShadow: "0 1px 2px rgba(16,42,48,0.04)",
            }}
          >
            <h2 className="text-base font-semibold text-[#102830] mb-5">
              Adjust Estimate
            </h2>

            <div className="space-y-6">
              <SliderRow
                id="price"
                label="Price Per Watt"
                display={`$${sliders.price.toFixed(2)}/W`}
                value={sliders.price}
                min={PRICE.min}
                max={PRICE.max}
                step={PRICE.step}
                minLabel={`$${PRICE.min.toFixed(2)}`}
                maxLabel={`$${PRICE.max.toFixed(2)}`}
                disabled={disabled}
                onChange={(v) => handleSliderChange("price", v)}
              />
              <SliderRow
                id="size"
                label="System Size"
                display={`${Math.round(sliders.size)} kW-DC`}
                value={clamp(sliders.size, SIZE_MIN_KW, sizeMax)}
                min={SIZE_MIN_KW}
                max={sizeMax}
                step={1}
                minLabel={`${SIZE_MIN_KW} kW`}
                maxLabel={`${Math.round(sizeMax)} kW · max for rooftop`}
                disabled={disabled}
                onChange={(v) => handleSliderChange("size", v)}
              />
              <SliderRow
                id="shading"
                label="Shading Level"
                display={`${Math.round(sliders.shading)}%`}
                value={sliders.shading}
                min={SHADING.min}
                max={SHADING.max}
                step={SHADING.step}
                minLabel="0%"
                maxLabel="30%"
                disabled={disabled}
                onChange={(v) => handleSliderChange("shading", v)}
              />

              {/* Advanced controls */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="flex items-center gap-1.5 text-sm text-[#5F7378] hover:text-[#0D4E5E] transition-colors"
                >
                  Advanced controls
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform",
                      showAdvanced && "rotate-180",
                    )}
                  />
                </button>

                {showAdvanced && (
                  <div className="mt-4 space-y-6 pt-4 border-t"
                    style={{ borderColor: "#EAEFF0" }}>
                    <SliderRow
                      id="utility-rate"
                      label="Blended utility rate"
                      display={`$${advancedRate.toFixed(2)}/kWh`}
                      value={advancedRate}
                      min={0.05}
                      max={0.5}
                      step={0.01}
                      minLabel="$0.05"
                      maxLabel="$0.50"
                      disabled={disabled}
                      onChange={handleAdvancedRate}
                    />
                    <SliderRow
                      id="escalation"
                      label="Rate escalation"
                      display={`${advancedEscalation.toFixed(1)}%/yr`}
                      value={advancedEscalation}
                      min={0}
                      max={10}
                      step={0.1}
                      minLabel="0%"
                      maxLabel="10%"
                      disabled={disabled}
                      onChange={handleAdvancedEscalation}
                    />
                  </div>
                )}
              </div>
            </div>

            {saveState === "error" && (
              <p className="mt-4 text-sm text-destructive" role="alert">
                {saveError || "Failed to recalculate the estimate."}
              </p>
            )}
            {shareNote && (
              <p className="mt-4 text-sm text-[#5F7378]">{shareNote}</p>
            )}
          </div>
        </main>
      </div>

      {/* ── Sticky bottom toolbar ── */}
      <footer
        className="flex items-center justify-between px-6 py-3 bg-white border-t gap-3"
        style={{ borderColor: "#EAEFF0" }}
      >
        <Button asChild variant="outline" size="sm">
          <Link href={config.routes.results}>
            <ArrowLeft className="h-4 w-4" />
            Back to Results
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleShare}>
            <Share2 className="h-4 w-4" />
            Share
          </Button>
          {estimate ? (
            <Button asChild variant="outline" size="sm">
              <a
                href={`/api/estimates/${estimate.id}/pdf`}
                target="_blank"
                rel="noreferrer"
              >
                <FileDown className="h-4 w-4" />
                Export PDF
              </a>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              <FileDown className="h-4 w-4" />
              Export PDF
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSave}
            disabled={disabled || saveState === "saving"}
          >
            <Save className="h-4 w-4" />
            Save Estimate
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`${config.routes.rfp}?propertyId=${property.id}`}>
              <FileText className="h-4 w-4" />
              Create RFP
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            className="bg-[#0D4E5E] hover:bg-[#0a3f4d] text-white"
          >
            <Link href={config.routes.propertyLeads(String(property.id))}>
              Get Leads
              <Users className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </footer>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LiveBadge({ state }: { state: SaveState }) {
  return (
    <div
      className="flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1"
      style={{
        background: state === "saving" ? "#FFF9E6" : "#E9F8F0",
        color: state === "saving" ? "#92600A" : "#0D7A45",
        border: `1px solid ${state === "saving" ? "#F5D87A" : "#A3DFC0"}`,
      }}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          state === "saving" ? "bg-amber-400" : "bg-emerald-500",
        )}
      />
      {state === "saving"
        ? "Saving…"
        : state === "saved"
          ? "Live estimate · auto-saving"
          : state === "error"
            ? "Error saving"
            : "Live estimate"}
    </div>
  )
}

function Section({
  label,
  icon,
  open,
  onToggle,
  badge,
  children,
}: {
  label: string
  icon?: ReactNode
  open: boolean
  onToggle: () => void
  badge?: ReactNode
  children: ReactNode
}) {
  return (
    <div
      className="border-b"
      style={{ borderColor: "#EAEFF0" }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 px-6 py-4 hover:bg-[#F8FAFB] transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          {icon && <span className="text-[#5F7378]">{icon}</span>}
          <span className="text-sm font-semibold text-[#102830]">{label}</span>
          {badge}
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-[#5F7378] transition-transform shrink-0",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="px-6 pb-5">
          {children}
        </div>
      )}
    </div>
  )
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: "#F4F7F8", border: "1px solid #EAEFF0" }}
    >
      <p className="text-[10px] font-semibold text-[#5F7378] uppercase tracking-wider mb-0.5">
        {label}
      </p>
      <p className="text-sm font-semibold text-[#102830]">{value}</p>
    </div>
  )
}

function ReadRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-[#5F7378]">{label}</span>
      <span className="font-medium text-[#102830] text-right">{value || "—"}</span>
    </div>
  )
}

function PVRow({
  label,
  value,
  highlighted,
  muted,
}: {
  label: string
  value: string
  highlighted?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex items-center justify-between py-2.5 text-sm"
      style={{ borderBottom: "1px solid #F4F7F8" }}>
      <span className={muted ? "text-[#5F7378] text-xs" : "text-[#102830]"}>
        {label}
      </span>
      <span
        className={cn(
          "font-semibold",
          highlighted ? "text-[#0D4E5E]" : muted ? "text-[#102830] text-xs" : "text-[#102830]",
        )}
      >
        {value}
      </span>
    </div>
  )
}

// ─── Slider row ───────────────────────────────────────────────────────────────

function SliderRow({
  id,
  label,
  display,
  value,
  min,
  max,
  step,
  minLabel,
  maxLabel,
  disabled,
  onChange,
}: {
  id: string
  label: string
  display: string
  value: number
  min: number
  max: number
  step: number
  minLabel?: string
  maxLabel?: string
  disabled?: boolean
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-sm text-[#102830]">
          {label}
        </Label>
        <span className="text-sm font-semibold text-[#0D4E5E] tabular-nums">
          {display}
        </span>
      </div>
      <Slider
        id={id}
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(vals) => onChange(vals[0])}
        aria-label={label}
      />
      {(minLabel || maxLabel) && (
        <div className="flex justify-between text-xs text-[#5F7378]">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      )}
    </div>
  )
}

// ─── Economics grid ───────────────────────────────────────────────────────────

function EconomicsGrid({ estimate }: { estimate: Estimate | null }) {
  if (!estimate) {
    return (
      <div className="flex items-center justify-center h-24 text-sm text-[#5F7378]">
        Calculating…
      </div>
    )
  }

  const annual = toNum(estimate.annual_savings)
  const lifetime = toNum(estimate.savings_20yr)
  const irr = toNum(estimate.irr)
  const npv = toNum(estimate.npv)
  const payback = toNum(estimate.simple_payback_years)
  const co2 = toNum(estimate.co2_offset_20yr)

  const hasProduction =
    toNum(estimate.annual_production_kwh) !== null &&
    (toNum(estimate.annual_production_kwh) ?? 0) > 0

  if (!hasProduction) {
    return (
      <div className="text-center py-6 text-sm text-[#5F7378]">
        No rooftop solar data — adjust system size to compute economics.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      <MetricCard
        label="ANNUAL SAVINGS"
        value={annual !== null ? fmtDollars(annual) : "—"}
        tier={annual !== null ? (annual > 0 ? "good" : "poor") : "neutral"}
      />
      <MetricCard
        label="20-YR SAVINGS"
        value={lifetime !== null ? fmtDollars(lifetime) : "—"}
        tier={lifetime !== null ? (lifetime > 0 ? "good" : "poor") : "neutral"}
      />
      <MetricCard
        label="IRR"
        value={irr !== null ? `${(irr * 100).toFixed(1)}%` : "—"}
        tier={
          irr === null
            ? "neutral"
            : irr >= 0.12
              ? "good"
              : irr >= 0.06
                ? "fair"
                : "poor"
        }
      />
      <MetricCard
        label="NPV"
        value={npv !== null ? fmtDollars(npv) : "—"}
        tier={npv !== null ? (npv > 0 ? "good" : "poor") : "neutral"}
      />
      <MetricCard
        label="SIMPLE PAYBACK"
        value={payback !== null ? `${payback.toFixed(1)} yrs` : "Never"}
        tier={
          payback === null
            ? "poor"
            : payback <= 7
              ? "good"
              : payback <= 12
                ? "fair"
                : "poor"
        }
      />
      <MetricCard
        label="CO₂ SAVED · 20YR"
        value={
          co2 !== null
            ? `${(co2 / 1000).toLocaleString("en-US", { maximumFractionDigits: 0 })} t`
            : "—"
        }
        tier={co2 !== null && co2 > 0 ? "good" : "neutral"}
      />
    </div>
  )
}

type Tier = "good" | "fair" | "poor" | "neutral"

const TIER_COLOR: Record<Tier, string> = {
  good: "#0C6E48",
  fair: "#92600A",
  poor: "#B91C1C",
  neutral: "#102830",
}

function MetricCard({
  label,
  value,
  tier,
}: {
  label: string
  value: string
  tier: Tier
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "#F8FAFB", border: "1px solid #EAEFF0" }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#5F7378] mb-1">
        {label}
      </p>
      <p
        className="text-xl font-bold tabular-nums"
        style={{ color: TIER_COLOR[tier] }}
      >
        {value}
      </p>
    </div>
  )
}

// ─── Parcel map ───────────────────────────────────────────────────────────────

function boundsForArea(
  lat: number,
  lon: number,
  areaFt2: number,
): google.maps.LatLngBoundsLiteral {
  const sideM = Math.sqrt(areaFt2 * SQFT_TO_SQM)
  const half = sideM / 2
  const dLat = half / METERS_PER_DEGREE_LAT
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 1e-6)
  const dLon = half / (METERS_PER_DEGREE_LAT * cosLat)
  return {
    north: lat + dLat,
    south: lat - dLat,
    east: lon + dLon,
    west: lon - dLon,
  }
}

function ParcelMap({
  lat,
  lon,
  parcelAreaFt2,
  rooftopAreaFt2,
  systemSizeKw,
}: {
  lat: number | null
  lon: number | null
  parcelAreaFt2: number | null
  rooftopAreaFt2: number | null
  systemSizeKw: number | null
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const apiKey = config.googleMaps.apiKey

  const footprintFt2 =
    systemSizeKw !== null && systemSizeKw > 0
      ? systemSizeKw * FT2_PER_KW
      : rooftopAreaFt2 !== null && rooftopAreaFt2 > 0
        ? rooftopAreaFt2
        : null

  const hasLocation = lat !== null && lon !== null

  useEffect(() => {
    if (!hasLocation || lat === null || lon === null) return
    if (!apiKey) {
      setMapError("Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to display the map.")
      return
    }
    let cancelled = false
    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !containerRef.current || !window.google?.maps) return
        const map = new window.google.maps.Map(containerRef.current, {
          center: { lat, lng: lon },
          zoom: 20,
          mapTypeId: "satellite",
          disableDefaultUI: true,
          zoomControl: true,
        })
        if (parcelAreaFt2 !== null && parcelAreaFt2 > 0) {
          const bounds = boundsForArea(lat, lon, parcelAreaFt2)
          new window.google.maps.Rectangle({
            bounds,
            map,
            clickable: false,
            strokeColor: "#fbbf24",
            strokeOpacity: 0.9,
            strokeWeight: 2,
            fillOpacity: 0,
            zIndex: 1,
          })
          map.fitBounds(bounds, 24)
        }
        if (footprintFt2 !== null) {
          new window.google.maps.Rectangle({
            bounds: boundsForArea(lat, lon, footprintFt2),
            map,
            clickable: false,
            strokeColor: "#2DD4BF",
            strokeOpacity: 0.9,
            strokeWeight: 2,
            fillColor: "#2DD4BF",
            fillOpacity: 0.3,
            zIndex: 2,
          })
        }
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setMapError(
            err instanceof Error ? err.message : "Could not load the map.",
          )
      })
    return () => {
      cancelled = true
    }
  }, [apiKey, hasLocation, lat, lon, parcelAreaFt2, footprintFt2])

  if (!hasLocation) {
    return (
      <div
        className="flex items-center justify-center h-64 rounded-2xl text-sm text-[#5F7378]"
        style={{ border: "1px solid #EAEFF0", background: "#F4F7F8" }}
      >
        Location unavailable for this property.
      </div>
    )
  }

  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{ height: "280px", border: "1px solid #EAEFF0" }}
    >
      {mapError ? (
        <div className="flex h-full items-center justify-center bg-[#F4F7F8] text-sm text-[#5F7378] p-6 text-center">
          {mapError}
        </div>
      ) : (
        <div ref={containerRef} className="h-full w-full" />
      )}

      {/* Legend chips */}
      {!mapError && (
        <div className="absolute top-3 left-3 flex gap-2">
          {footprintFt2 !== null && systemSizeKw !== null && (
            <MapChip color="#2DD4BF" fillOpacity={0.3}>
              Rooftop · {Math.round(systemSizeKw)} kW
            </MapChip>
          )}
          {parcelAreaFt2 !== null && parcelAreaFt2 > 0 && (
            <MapChip color="#fbbf24" border>
              Parcel boundary
            </MapChip>
          )}
        </div>
      )}
    </div>
  )
}

function MapChip({
  color,
  border,
  fillOpacity = 0,
  children,
}: {
  color: string
  border?: boolean
  fillOpacity?: number
  children: ReactNode
}) {
  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white"
      style={{
        background: "rgba(16,40,48,0.75)",
        backdropFilter: "blur(4px)",
      }}
    >
      <span
        className="h-3 w-3 rounded-sm shrink-0"
        style={{
          border: `2px solid ${color}`,
          background:
            fillOpacity > 0
              ? `rgba(${hexToRgb(color)}, ${fillOpacity})`
              : "transparent",
        }}
      />
      {children}
    </div>
  )
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r},${g},${b}`
}
