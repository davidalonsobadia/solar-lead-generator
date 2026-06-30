"use client"

import type React from "react"

import { useState } from "react"
import Link from "next/link"
import { authApi } from "@/features/auth/api"

export default function RegisterPage() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      setLoading(false)
      return
    }

    try {
      const result = await authApi.register({ name, email, password })
      if (result.success) {
        setSuccess(true)
      } else {
        setError(result.message || "Registration failed")
      }
    } catch {
      setError("An error occurred. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#EEF2F3" }}>
        <div
          className="w-full max-w-md bg-white rounded-2xl p-8 text-center"
          style={{
            border: "1px solid #EAEFF0",
            boxShadow: "0 1px 2px rgba(16,42,48,0.04), 0 8px 28px rgba(16,42,48,0.07)",
          }}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: "#EDF6F8" }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M20 6L9 17L4 12"
                stroke="#0F586A"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-[#102830] mb-2">Check your email</h2>
          <p className="text-sm text-[#5F7378] mb-2">
            We&apos;ve sent a verification link to
          </p>
          <p className="text-sm font-semibold text-[#102830] mb-6">{email}</p>
          <p className="text-sm text-[#8FA5AA] mb-8">
            Click the link in the email to verify your account. Once verified, you can sign in.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center w-full h-[50px] text-white text-sm font-semibold rounded-[11px] transition-opacity hover:opacity-90"
            style={{ background: "linear-gradient(180deg, #0F586A 0%, #0C4453 100%)" }}
          >
            Back to sign in
          </Link>
        </div>
      </div>
    )
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

        <h1 className="text-2xl font-bold text-[#102830] mb-1">Create your account</h1>
        <p className="text-sm text-[#5F7378] mb-8">Get started with Solscout for free</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-semibold text-[#102830] mb-2">
              Full name
            </label>
            <input
              id="name"
              type="text"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full h-[50px] px-4 text-sm text-[#102830] placeholder-[#AAB8BB] bg-[#FCFDFD] rounded-[11px] focus:outline-none focus:ring-2 focus:ring-[#0F586A]/20"
              style={{ border: "1.5px solid #DCE4E6" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#0F586A")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#DCE4E6")}
            />
          </div>

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
            <label htmlFor="password" className="block text-sm font-semibold text-[#102830] mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full h-[50px] px-4 text-sm text-[#102830] placeholder-[#AAB8BB] bg-[#FCFDFD] rounded-[11px] focus:outline-none focus:ring-2 focus:ring-[#0F586A]/20"
              style={{ border: "1.5px solid #DCE4E6" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#0F586A")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#DCE4E6")}
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-semibold text-[#102830] mb-2">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type="password"
              placeholder="Confirm your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="text-sm text-center text-[#8FA5AA] mt-6">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-[#0D4E5E] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
