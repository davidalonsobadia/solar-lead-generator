import type React from "react"

import { TabNav } from "@/components/tab-nav"

export default function AppShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="min-h-screen bg-background">
      <TabNav />
      <main className="mx-auto max-w-[960px] px-6 py-10">{children}</main>
    </div>
  )
}
