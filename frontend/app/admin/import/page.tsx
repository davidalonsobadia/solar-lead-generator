"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { authApi } from "@/features/auth/api"
import { Loader2 } from "lucide-react"
import { ImportCard } from "@/features/imports/import-card"
import {
  importsApi,
  type BenchmarkImportSummary,
  type ImportSummary,
} from "@/features/imports/api"

export default function ImportPage() {
  const router = useRouter()
  const [checkingAuth, setCheckingAuth] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const userResult = await authApi.getCurrentUser()
        if (!userResult.success) {
          router.push("/login")
          return
        }
        setCheckingAuth(false)
      } catch (err) {
        console.error("[Import] Auth check error:", err)
        router.push("/login")
      }
    }
    checkAuth()
  }, [router])

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-3xl p-4 py-8 space-y-10">
      <section className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">CSV import</h1>
          <p className="text-sm text-muted-foreground">
            Upload the canonical property CSV to create properties, companies,
            stakeholders, and leads.
          </p>
        </div>

        <ImportCard<ImportSummary>
          title="Property CSV"
          description={
            <>
              Select a <code>.csv</code> file that matches the canonical
              property template.
            </>
          }
          inputId="property-csv-file"
          templateHref="/import-template.csv"
          upload={importsApi.uploadCsv}
          stats={(summary) => [
            { label: "Rows OK", value: summary.rows_ok },
            { label: "Properties", value: summary.properties_created },
            { label: "Companies", value: summary.companies_created },
            { label: "Stakeholders", value: summary.stakeholders_created },
            { label: "Leads", value: summary.leads_created },
          ]}
        />
      </section>

      <section className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold">Industry EUI benchmarks</h2>
          <p className="text-sm text-muted-foreground">
            Upload the industry energy-use intensity (EUI) CSV. Rows upsert by{" "}
            <code>(business_industry, region)</code>.
          </p>
        </div>

        <ImportCard<BenchmarkImportSummary>
          title="Benchmark CSV"
          description={
            <>
              Select a <code>.csv</code> file with the columns{" "}
              <code>business_industry, eui_kwh_per_sqft_year, region, source,
              notes</code>
              .
            </>
          }
          inputId="benchmark-csv-file"
          templateHref="/benchmarks-template.csv"
          upload={importsApi.uploadBenchmarks}
          stats={(summary) => [
            { label: "Rows OK", value: summary.rows_ok },
            { label: "Created", value: summary.benchmarks_created },
            { label: "Updated", value: summary.benchmarks_updated },
          ]}
        />
      </section>
    </div>
  )
}
