import type React from "react"

import { TabNav } from "@/components/tab-nav"

// Shared shell for the Sunscout v1 screens: a persistent tab bar plus the
// active screen rendered below it. Screen content lands in FE-03..FE-11.
export default function AppShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="min-h-screen bg-background">
      <TabNav />
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
