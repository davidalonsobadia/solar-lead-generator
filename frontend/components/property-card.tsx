"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { MapPin, Users, Zap, Eye } from "lucide-react"

import { config } from "@/lib/config"
import type { PropertyListItem } from "@/features/properties/api"

function formatArea(value: number | string | null): string {
  if (value === null || value === undefined || value === "") return "—"
  const num = typeof value === "string" ? Number(value) : value
  if (Number.isNaN(num)) return "—"
  return `${Math.round(num).toLocaleString()} sq ft`
}

function buildSatelliteUrl(address: string | null): string | null {
  if (!address) return null
  const key = config.googleMaps.apiKey
  if (!key) return null
  const encoded = encodeURIComponent(address)
  return (
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?center=${encoded}&zoom=19&size=640x360&maptype=satellite&scale=2&key=${key}`
  )
}

interface PropertyCardProps {
  property: PropertyListItem
}

export function PropertyCard({ property }: PropertyCardProps) {
  const company = property.owner_company_name || "Unknown company"
  const estimatePath = config.routes.propertyEstimate(String(property.id))

  const satelliteUrl = buildSatelliteUrl(property.address ?? null)
  const [imgSrc, setImgSrc] = useState<string>(satelliteUrl ?? "/placeholder.jpg")

  return (
    <div
      className="bg-white rounded-2xl overflow-hidden flex flex-col"
      style={{
        border: "1px solid #EAEFF0",
        boxShadow: "0 1px 2px rgba(16,42,48,0.04), 0 4px 16px rgba(16,42,48,0.06)",
      }}
    >
      {/* Rooftop satellite image */}
      <div className="relative w-full bg-[#D8E6EA]" style={{ aspectRatio: "16/9" }}>
        <Image
          src={imgSrc}
          alt={`${company} rooftop satellite view`}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover"
          onError={() => setImgSrc("/placeholder.jpg")}
          unoptimized
        />
        <div
          className="absolute right-3 top-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white"
          style={{
            background: property.has_estimate ? "#0F586A" : "rgba(16,40,48,0.78)",
            backdropFilter: "blur(4px)",
          }}
        >
          {property.has_estimate && (
            <svg className="w-3 h-3 shrink-0" viewBox="0 0 12 12" fill="none">
              <path
                d="M2 6l3 3 5-5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
          {property.has_estimate ? "Estimated" : "Not Estimated"}
        </div>
      </div>

      {/* Card body */}
      <div className="p-5 flex flex-col flex-1 gap-4">
        {/* Company name + industry + location */}
        <div>
          <h3
            className="font-bold text-[#102830] text-[17px] leading-snug mb-2 truncate"
            title={company}
          >
            {company}
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            {property.industry && (
              <span
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                style={{ background: "#EDF6F8", color: "#0D4E5E" }}
              >
                {property.industry}
              </span>
            )}
            {property.city && (
              <span className="flex items-center gap-1 text-xs text-[#5F7378]">
                <MapPin className="h-3 w-3 shrink-0" />
                {property.city}
              </span>
            )}
          </div>
        </div>

        {/* Leads count chip */}
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg self-start"
          style={{ background: "#F4F7F8" }}
        >
          <Users className="h-4 w-4 text-[#5F7378]" />
          <span className="text-sm text-[#102830]">
            Leads: <span className="font-semibold">{property.leads}</span>
          </span>
        </div>

        {/* Divider */}
        <div className="h-px bg-[#EAEFF0]" />

        {/* Area metrics */}
        <dl className="space-y-2.5">
          <div className="flex justify-between text-sm">
            <dt className="text-[#5F7378]">Rooftop Area</dt>
            <dd className="font-medium text-[#102830]">{formatArea(property.solar_rooftop_area)}</dd>
          </div>
          <div className="flex justify-between text-sm">
            <dt className="text-[#5F7378]">Building Area</dt>
            <dd className="font-medium text-[#102830]">{formatArea(property.building_area)}</dd>
          </div>
          <div className="flex justify-between text-sm">
            <dt className="text-[#5F7378]">Parcel Area</dt>
            <dd className="font-medium text-[#102830]">{formatArea(property.parcel_area)}</dd>
          </div>
        </dl>

        {/* CTA */}
        <div className="mt-auto pt-1">
          {property.has_estimate ? (
            <Link
              href={estimatePath}
              className="w-full h-11 flex items-center justify-center gap-2 text-sm font-semibold rounded-[10px] transition-colors hover:bg-[#E0F0F4]"
              style={{ background: "#EDF6F8", color: "#0D4E5E", border: "1.5px solid #C5DEE4" }}
            >
              <Eye className="h-4 w-4" />
              View Estimate
            </Link>
          ) : (
            <Link
              href={estimatePath}
              className="w-full h-11 flex items-center justify-center gap-2 text-sm font-semibold text-white rounded-[10px] transition-opacity hover:opacity-90"
              style={{ background: "linear-gradient(180deg, #0F586A 0%, #0C4453 100%)" }}
            >
              <Zap className="h-4 w-4" />
              Generate Estimate
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
