"use client"

import type React from "react"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { authApi } from "@/features/auth/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Spinner } from "@/components/ui/spinner"
import {
  importsApi,
  type BenchmarkImportSummary,
  type ImportSummary,
  type RowError,
} from "@/features/imports/api"
import { AlertCircle, Download, Loader2, Upload } from "lucide-react"

export default function ImportPage() {
  const router = useRouter()
  const [checkingAuth, setCheckingAuth] = useState(true)

  // Property CSV upload state.
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Benchmarks CSV upload state.
  const [benchmarkFile, setBenchmarkFile] = useState<File | null>(null)
  const [benchmarkLoading, setBenchmarkLoading] = useState(false)
  const [benchmarkError, setBenchmarkError] = useState("")
  const [benchmarkSummary, setBenchmarkSummary] =
    useState<BenchmarkImportSummary | null>(null)
  const benchmarkInputRef = useRef<HTMLInputElement>(null)

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

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      setError("Please choose a CSV file to upload.")
      return
    }

    setLoading(true)
    setError("")
    setSummary(null)

    try {
      const result = await importsApi.uploadCsv(file)
      if (result.success && result.summary) {
        setSummary(result.summary)
        // Reset the file picker so the user can immediately upload another file.
        setFile(null)
        if (inputRef.current) {
          inputRef.current.value = ""
        }
      } else {
        setError(result.message || "Import failed. Please try again.")
      }
    } catch {
      setError("An error occurred while uploading. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleBenchmarkUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!benchmarkFile) {
      setBenchmarkError("Please choose a CSV file to upload.")
      return
    }

    setBenchmarkLoading(true)
    setBenchmarkError("")
    setBenchmarkSummary(null)

    try {
      const result = await importsApi.uploadBenchmarks(benchmarkFile)
      if (result.success && result.summary) {
        setBenchmarkSummary(result.summary)
        setBenchmarkFile(null)
        if (benchmarkInputRef.current) {
          benchmarkInputRef.current.value = ""
        }
      } else {
        setBenchmarkError(result.message || "Import failed. Please try again.")
      }
    } catch {
      setBenchmarkError("An error occurred while uploading. Please try again.")
    } finally {
      setBenchmarkLoading(false)
    }
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-3xl p-4 py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">CSV import</h1>
        <p className="text-sm text-muted-foreground">
          Upload the canonical property CSV to create properties, companies,
          stakeholders, and leads, or load the industry EUI benchmarks table.
        </p>
      </div>

      <UploadCard
        title="Property CSV"
        description={
          <>
            Select a <code>.csv</code> file that matches the canonical property
            template.
          </>
        }
        inputId="csv-file"
        inputRef={inputRef}
        templateHref="/import-template.csv"
        loading={loading}
        error={error}
        canSubmit={!!file}
        onFileChange={(selected) => {
          setFile(selected)
          setError("")
          setSummary(null)
        }}
        onSubmit={handleUpload}
      />

      {summary && (
        <Card>
          <CardHeader>
            <CardTitle>Property import summary</CardTitle>
            <CardDescription>
              {summary.rows_ok} row{summary.rows_ok === 1 ? "" : "s"} imported
              successfully
              {summary.errors.length > 0
                ? `, ${summary.errors.length} row${
                    summary.errors.length === 1 ? "" : "s"
                  } failed.`
                : "."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
              <SummaryStat label="Rows OK" value={summary.rows_ok} />
              <SummaryStat
                label="Properties"
                value={summary.properties_created}
              />
              <SummaryStat
                label="Companies"
                value={summary.companies_created}
              />
              <SummaryStat
                label="Stakeholders"
                value={summary.stakeholders_created}
              />
              <SummaryStat label="Leads" value={summary.leads_created} />
            </div>

            <RowErrorsTable errors={summary.errors} />
          </CardContent>
        </Card>
      )}

      <UploadCard
        title="Industry EUI benchmarks CSV"
        description={
          <>
            Select a <code>.csv</code> file with columns{" "}
            <code>business_industry, eui_kwh_per_sqft_year, region, source,
            notes</code>
            . Rows upsert by industry and region.
          </>
        }
        inputId="benchmarks-file"
        inputRef={benchmarkInputRef}
        templateHref="/benchmarks-template.csv"
        loading={benchmarkLoading}
        error={benchmarkError}
        canSubmit={!!benchmarkFile}
        onFileChange={(selected) => {
          setBenchmarkFile(selected)
          setBenchmarkError("")
          setBenchmarkSummary(null)
        }}
        onSubmit={handleBenchmarkUpload}
      />

      {benchmarkSummary && (
        <Card>
          <CardHeader>
            <CardTitle>Benchmarks import summary</CardTitle>
            <CardDescription>
              {benchmarkSummary.rows_ok} row
              {benchmarkSummary.rows_ok === 1 ? "" : "s"} applied successfully
              {benchmarkSummary.errors.length > 0
                ? `, ${benchmarkSummary.errors.length} row${
                    benchmarkSummary.errors.length === 1 ? "" : "s"
                  } failed.`
                : "."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <SummaryStat label="Rows OK" value={benchmarkSummary.rows_ok} />
              <SummaryStat
                label="Created"
                value={benchmarkSummary.benchmarks_created}
              />
              <SummaryStat
                label="Updated"
                value={benchmarkSummary.benchmarks_updated}
              />
            </div>

            <RowErrorsTable errors={benchmarkSummary.errors} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function UploadCard({
  title,
  description,
  inputId,
  inputRef,
  templateHref,
  loading,
  error,
  canSubmit,
  onFileChange,
  onSubmit,
}: {
  title: string
  description: React.ReactNode
  inputId: string
  inputRef: React.RefObject<HTMLInputElement | null>
  templateHref: string
  loading: boolean
  error: string
  canSubmit: boolean
  onFileChange: (file: File | null) => void
  onSubmit: (e: React.FormEvent) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={inputId}>CSV file</Label>
            <Input
              ref={inputRef}
              id={inputId}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
              disabled={loading}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Upload failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-3 pt-6">
          <Button type="submit" disabled={loading || !canSubmit}>
            {loading ? (
              <>
                <Spinner className="size-4" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="size-4" />
                Upload
              </>
            )}
          </Button>
          <Button type="button" variant="outline" asChild>
            <a href={templateHref} download>
              <Download className="size-4" />
              Download template
            </a>
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

function RowErrorsTable({ errors }: { errors: RowError[] }) {
  if (errors.length === 0) {
    return null
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium">Row errors</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">Line</TableHead>
            <TableHead>Reason</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {errors.map((rowError, index) => (
            <TableRow key={`${rowError.line}-${index}`}>
              <TableCell className="font-mono">{rowError.line}</TableCell>
              <TableCell>{rowError.reason}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
