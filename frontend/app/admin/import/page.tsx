"use client"

import type React from "react"

import { useRef, useState } from "react"
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
import { importsApi, type ImportSummary } from "@/features/imports/api"
import { AlertCircle, Download, Upload } from "lucide-react"

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null)
    setError("")
    setSummary(null)
  }

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
      } else {
        setError(result.message || "Import failed. Please try again.")
      }
    } catch {
      setError("An error occurred while uploading. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto max-w-3xl p-4 py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">CSV import</h1>
        <p className="text-sm text-muted-foreground">
          Upload the canonical property CSV to create properties, companies,
          stakeholders, and leads.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload file</CardTitle>
          <CardDescription>
            Select a <code>.csv</code> file that matches the canonical template.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleUpload}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="csv-file">CSV file</Label>
              <Input
                ref={inputRef}
                id="csv-file"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
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
            <Button type="submit" disabled={loading || !file}>
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
              <a href="/import-template.csv" download>
                <Download className="size-4" />
                Download template
              </a>
            </Button>
          </CardFooter>
        </form>
      </Card>

      {summary && (
        <Card>
          <CardHeader>
            <CardTitle>Import summary</CardTitle>
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

            {summary.errors.length > 0 && (
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
                    {summary.errors.map((rowError) => (
                      <TableRow key={rowError.line}>
                        <TableCell className="font-mono">
                          {rowError.line}
                        </TableCell>
                        <TableCell>{rowError.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
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
