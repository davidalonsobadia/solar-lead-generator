import type React from "react"
import type { Metadata } from "next"
import { Inter, Inter_Tight } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { config } from "@/lib/config"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  weight: ["400", "500", "600", "700", "800"],
})

export const metadata: Metadata = {
  title: config.app.name,
  description: config.app.description,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${interTight.variable}`}>
      <body className="font-sans antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
