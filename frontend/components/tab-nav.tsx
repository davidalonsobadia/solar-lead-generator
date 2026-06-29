"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Database, FileText, Search, Sun, Table2 } from "lucide-react"

import { config } from "@/lib/config"
import { cn } from "@/lib/utils"

type TabItem = {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

// Primary screens, surfaced as the main tab bar.
const PRIMARY_TABS: TabItem[] = [
  { label: "Find Leads", href: config.routes.findLeads, icon: Search },
  { label: "Results", href: config.routes.results, icon: Table2 },
  { label: "RFP", href: config.routes.rfp, icon: FileText },
]

// Secondary entry points kept out of the main tab flow.
const SECONDARY_TABS: TabItem[] = [
  { label: "Import", href: config.routes.adminImport, icon: Database },
]

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}

function TabLink({ item, active }: { item: TabItem; active: boolean }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
        "hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-muted text-foreground" : "text-muted-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  )
}

export function TabNav() {
  const pathname = usePathname()

  return (
    <header className="border-b bg-card">
      <div className="container mx-auto flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={config.routes.findLeads}
          className="flex items-center gap-2 font-bold"
        >
          <Sun className="h-6 w-6 text-primary" />
          <span className="text-xl">{config.app.name}</span>
        </Link>

        <nav
          aria-label="Primary"
          className="-mx-1 flex items-center gap-1 overflow-x-auto sm:mx-0"
        >
          {PRIMARY_TABS.map((item) => (
            <TabLink
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
            />
          ))}
          <span className="mx-1 hidden h-5 w-px bg-border sm:inline-block" />
          {SECONDARY_TABS.map((item) => (
            <TabLink
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
            />
          ))}
        </nav>
      </div>
    </header>
  )
}
