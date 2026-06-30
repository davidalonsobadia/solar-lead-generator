"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { authApi } from "@/features/auth/api"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const result = await authApi.login({ email, password })
      if (result.success) {
        router.push("/find-leads")
      } else {
        setError(result.message || "Login failed")
      }
    } catch {
      setError("An error occurred. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#EEF2F3" }}>
      <div
        className="w-full max-w-md bg-white rounded-2xl p-8"
        style={{
          border: "1px solid #EAEFF0",
          boxShadow: "0 1px 2px rgba(16,42,48,0.04), 0 8px 28px rgba(16,42,48,0.07)",
        }}
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 mb-8">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "#0D4E5E" }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1.5L14.5 8L8 14.5L1.5 8L8 1.5Z" fill="white" />
            </svg>
          </div>
          <span
            className="font-bold text-[#0D4E5E] text-lg"
            style={{ fontFamily: "var(--font-inter-tight, 'Inter Tight', sans-serif)" }}
          >
            Solscout
          </span>
        </div>

        <h1 className="text-2xl font-bold text-[#102830] mb-1">Welcome back</h1>
        <p className="text-sm text-[#5F7378] mb-8">Sign in to your account to continue</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-semibold text-[#102830] mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full h-[50px] px-4 text-sm text-[#102830] placeholder-[#AAB8BB] bg-[#FCFDFD] rounded-[11px] focus:outline-none focus:ring-2 focus:ring-[#0F586A]/20"
              style={{ border: "1.5px solid #DCE4E6" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#0F586A")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#DCE4E6")}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="password" className="text-sm font-semibold text-[#102830]">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-[#0D4E5E] hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full h-[50px] px-4 text-sm text-[#102830] placeholder-[#AAB8BB] bg-[#FCFDFD] rounded-[11px] focus:outline-none focus:ring-2 focus:ring-[#0F586A]/20"
              style={{ border: "1.5px solid #DCE4E6" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#0F586A")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#DCE4E6")}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-[50px] text-white text-sm font-semibold rounded-[11px] transition-opacity hover:opacity-90 disabled:opacity-60 mt-2"
            style={{ background: "linear-gradient(180deg, #0F586A 0%, #0C4453 100%)" }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-sm text-center text-[#8FA5AA] mt-6">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-medium text-[#0D4E5E] hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
