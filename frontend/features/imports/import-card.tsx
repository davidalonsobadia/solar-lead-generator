"use client"

import type React from "react"
import type { ReactNode } from "react"

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
import { AlertCircle, Download, Upload } from "lucide-react"
import type { RowError } from "@/features/imports/api"

interface UploadResult<TSummary> {
  success: boolean
  message?: string
  summary?: TSummary
}

interface ImportCardProps<TSummary extends { errors: RowError[] }> {
  /** Card title and short description shown above the file picker. */
  title: string
  description: ReactNode
  /** Stable id for the file input + label association. */
  inputId: string
  /** Path to the downloadable template (under `public/`), or omit to hide it. */
  templateHref?: string
  /** Upload helper that proxies the file to the backend via a route handler. */
  upload: (file: File) => Promise<UploadResult<TSummary>>
  /** Derive the summary stat tiles from a successful result. */
  stats: (summary: TSummary) => { label: string; value: number }[]
}

/**
 * A self-contained CSV upload zone: file picker, upload + download-template
 * actions, an error alert, and an import-summary card with per-row errors.
 *
 * Generic over the summary shape so it serves both the property and benchmark
 * imports, which share the same `errors` contract but report different stats.
 */
export function ImportCard<TSummary extends { errors: RowError[] }>({
  title,
  description,
  inputId,
  templateHref,
  upload,
  stats,
}: ImportCardProps<TSummary>) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [summary, setSummary] = useState<TSummary | null>(null)
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
      const result = await upload(file)
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

  const tiles = summary ? stats(summary) : []

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <form onSubmit={handleUpload}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={inputId}>CSV file</Label>
              <Input
                ref={inputRef}
                id={inputId}
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
            {templateHref && (
              <Button type="button" variant="outline" asChild>
                <a href={templateHref} download>
                  <Download className="size-4" />
                  Download template
                </a>
              </Button>
            )}
          </CardFooter>
        </form>
      </Card>

      {summary && (
        <Card>
          <CardHeader>
            <CardTitle>Import summary</CardTitle>
            <CardDescription>
              {summary.errors.length > 0
                ? `${summary.errors.length} row${
                    summary.errors.length === 1 ? "" : "s"
                  } failed to import.`
                : "All rows imported successfully."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
              {tiles.map((tile) => (
                <div key={tile.label} className="rounded-md border p-3">
                  <div className="text-2xl font-bold">{tile.value}</div>
                  <div className="text-xs text-muted-foreground">
                    {tile.label}
                  </div>
                </div>
              ))}
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
                    {summary.errors.map((rowError, index) => (
                      <TableRow key={`${rowError.line}-${index}`}>
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
