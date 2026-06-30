"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search, MapPin, Building2, Map, X, Plus } from "lucide-react"

import { MapView } from "@/components/map-view"
import { config } from "@/lib/config"

type SearchTab = "area" | "business" | "map"

const INDUSTRY_SUGGESTIONS = [
  "Grocery",
  "Retail",
  "Office",
  "Warehouse",
  "Manufacturing",
  "Restaurant",
  "Hotel",
  "Healthcare",
  "Education",
  "Fitness",
  "Convenience Store",
  "Cold Storage",
  "Car Dealership",
  "Laundry",
  "Supermarket",
  "Medical Office",
  "Pharmacy",
  "Bank",
  "Library",
  "Data Center",
]

const TAB_CONFIG = [
  { key: "area" as const, label: "Area & Industry", Icon: MapPin },
  { key: "business" as const, label: "Business Name", Icon: Building2 },
  { key: "map" as const, label: "Select on Map", Icon: Map },
]

export default function FindLeadsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<SearchTab>("area")

  // Area & Industry state
  const [location, setLocation] = useState("")
  const [industries, setIndustries] = useState<string[]>([])
  const [industryInput, setIndustryInput] = useState("")

  // Business Name state
  const [businessName, setBusinessName] = useState("")
  const [lookalike, setLookalike] = useState(false)

  const handleAreaSearch = () => {
    const params = new URLSearchParams()
    if (industries.length > 0) params.set("industries", industries.join(","))
    if (location.trim()) params.set("location", location.trim())
    router.push(`${config.routes.results}?${params.toString()}`)
  }

  const handleBusinessSearch = () => {
    const params = new URLSearchParams()
    if (businessName.trim()) params.set("name", businessName.trim())
    router.push(`${config.routes.results}?${params.toString()}`)
  }

  const addIndustry = (name: string) => {
    const trimmed = name.trim()
    if (trimmed && !industries.includes(trimmed)) {
      setIndustries((prev) => [...prev, trimmed])
    }
    setIndustryInput("")
  }

  const removeIndustry = (name: string) => {
    setIndustries((prev) => prev.filter((i) => i !== name))
  }

  const handleIndustryKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && industryInput.trim()) {
      e.preventDefault()
      addIndustry(industryInput)
    }
    if (e.key === "Backspace" && !industryInput && industries.length > 0) {
      setIndustries((prev) => prev.slice(0, -1))
    }
  }

  const availableSuggestions = INDUSTRY_SUGGESTIONS.filter((s) => !industries.includes(s))

  return (
    <div className="max-w-3xl mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <h1
          className="text-[32px] font-bold text-[#102830] leading-tight"
          style={{ fontFamily: "var(--font-inter-tight, 'Inter Tight', sans-serif)" }}
        >
          Find Solar C&I Leads
        </h1>
        <p className="mt-2 text-[15px] text-[#5F7378]">
          Identify C&I properties to target. Search by area &amp; industry, business name or pick a
          building straight off the map.
        </p>
      </div>

      {/* Search card */}
      <div
        className="bg-white rounded-2xl overflow-hidden"
        style={{
          border: "1px solid #EAEFF0",
          boxShadow: "0 1px 2px rgba(16,42,48,0.04), 0 8px 28px rgba(16,42,48,0.07)",
        }}
      >
        {/* Tab bar */}
        <div className="bg-[#FAFCFC] border-b border-[#EAEFF0]">
          <div className="flex px-6">
            {TAB_CONFIG.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={[
                  "relative flex items-center gap-2 px-4 py-4 text-sm font-medium transition-colors whitespace-nowrap",
                  activeTab === key
                    ? "text-[#0D4E5E]"
                    : "text-[#5F7378] hover:text-[#0D4E5E]",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" />
                {label}
                {activeTab === key && (
                  <span
                    className="absolute bottom-0 left-0 right-0 h-[2.5px] rounded-t-full"
                    style={{ background: "#0F586A" }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="p-8">
          {/* ── Area & Industry ── */}
          {activeTab === "area" && (
            <div className="space-y-6">
              {/* Location */}
              <div>
                <label className="block text-sm font-semibold text-[#102830] mb-2">
                  City, Zip Code, or County
                </label>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#AAB8BB] pointer-events-none" />
                  <input
                    type="text"
                    placeholder="e.g. Fresno, CA · 93722 · Maricopa County"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full h-[50px] pl-11 pr-4 text-sm text-[#102830] placeholder-[#AAB8BB] bg-[#FCFDFD] rounded-[11px] focus:outline-none focus:ring-2 focus:ring-[#0F586A]/20"
                    style={{ border: "1.5px solid #DCE4E6" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "#0F586A")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "#DCE4E6")}
                  />
                </div>
                <p className="mt-1.5 text-xs text-[#AAB8BB]">One geographic area at a time.</p>
              </div>

              {/* Industry chips */}
              <div>
                <label className="block text-sm font-semibold text-[#102830] mb-2">
                  Business Industry{" "}
                  <span className="font-normal text-[#8FA5AA]">
                    (e.g. Grocery, Warehouse, Retail)
                  </span>
                </label>

                <IndustryChipInput
                  industries={industries}
                  inputValue={industryInput}
                  onInputChange={setIndustryInput}
                  onAdd={addIndustry}
                  onRemove={removeIndustry}
                  onKeyDown={handleIndustryKeyDown}
                />

                {/* Suggestion chips */}
                {availableSuggestions.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {availableSuggestions.slice(0, 6).map((s) => (
                      <button
                        key={s}
                        onClick={() => addIndustry(s)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-[#5F7378] rounded-full transition-colors hover:bg-[#EDF6F8] hover:text-[#0D4E5E]"
                        style={{ background: "#F4F7F8", border: "1px solid #E4EAEB" }}
                      >
                        <Plus className="h-3 w-3" />
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <SearchButton onClick={handleAreaSearch} />
            </div>
          )}

          {/* ── Business Name ── */}
          {activeTab === "business" && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-[#102830] mb-2">
                  Business Name
                </label>
                <div className="relative">
                  <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#AAB8BB] pointer-events-none" />
                  <input
                    type="text"
                    placeholder="e.g. Walmart, Target, Costco…"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full h-[50px] pl-11 pr-4 text-sm text-[#102830] placeholder-[#AAB8BB] bg-[#FCFDFD] rounded-[11px] focus:outline-none focus:ring-2 focus:ring-[#0F586A]/20"
                    style={{ border: "1.5px solid #DCE4E6" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "#0F586A")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "#DCE4E6")}
                  />
                </div>
                <p className="mt-1.5 text-xs text-[#AAB8BB]">
                  Search for a specific chain or brand across all locations.
                </p>
              </div>

              <label className="flex items-center gap-3 cursor-pointer select-none">
                <button
                  role="checkbox"
                  aria-checked={lookalike}
                  onClick={() => setLookalike((v) => !v)}
                  className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors"
                  style={{
                    background: lookalike ? "#0F586A" : "white",
                    border: `1.5px solid ${lookalike ? "#0F586A" : "#DCE4E6"}`,
                  }}
                >
                  {lookalike && (
                    <svg
                      className="w-3 h-3 text-white"
                      viewBox="0 0 12 12"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M2 6l3 3 5-5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
                <div>
                  <p className="text-sm font-medium text-[#102830]">
                    Find similar businesses (lookalike search)
                  </p>
                  <p className="text-xs text-[#8FA5AA] mt-0.5">
                    Expand results to include businesses with similar profiles
                  </p>
                </div>
              </label>

              <SearchButton onClick={handleBusinessSearch} />
            </div>
          )}

          {/* ── Select on Map ── */}
          {activeTab === "map" && (
            <div className="space-y-4">
              <p className="text-sm text-[#5F7378]">
                Navigate to any area and click a building rooftop to select it as a solar
                installation target.
              </p>
              <MapView className="rounded-[11px]" />
              <p className="text-xs text-[#AAB8BB]">
                Zoom in to building level to see individual rooftops. Click to select.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Sub-components ── */

function IndustryChipInput({
  industries,
  inputValue,
  onInputChange,
  onAdd,
  onRemove,
  onKeyDown,
}: {
  industries: string[]
  inputValue: string
  onInputChange: (v: string) => void
  onAdd: (v: string) => void
  onRemove: (v: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  return (
    <div
      className="flex flex-wrap gap-2 min-h-[50px] px-3 py-2.5 bg-[#FCFDFD] rounded-[11px] cursor-text"
      style={{ border: "1.5px solid #DCE4E6" }}
      onClick={(e) => {
        const input = (e.currentTarget as HTMLDivElement).querySelector("input")
        input?.focus()
      }}
    >
      {industries.map((name) => (
        <span
          key={name}
          className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-full"
          style={{ background: "#EDF6F8", color: "#0D4E5E" }}
        >
          {name}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemove(name)
            }}
            className="hover:text-[#0C4453] transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        type="text"
        placeholder={industries.length === 0 ? "Add an industry…" : "Add another…"}
        value={inputValue}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={onKeyDown}
        className="flex-1 min-w-[120px] bg-transparent text-sm text-[#102830] placeholder-[#AAB8BB] focus:outline-none"
      />
    </div>
  )
}

function SearchButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 px-6 h-[50px] text-white text-sm font-semibold rounded-[11px] transition-opacity hover:opacity-90"
      style={{ background: "linear-gradient(180deg, #0F586A 0%, #0C4453 100%)" }}
    >
      <Search className="h-4 w-4" />
      Search Rooftops
    </button>
  )
}
