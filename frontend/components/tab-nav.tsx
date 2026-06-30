"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Bell, LogOut } from "lucide-react"

import { config } from "@/lib/config"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type NavItem = {
  label: string
  href: string
}

const NAV_ITEMS: NavItem[] = [
  { label: "Find Leads", href: config.routes.findLeads },
  { label: "Rooftops", href: config.routes.results },
  { label: "My Lists", href: config.routes.lists },
]

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}

function DiamondLogo() {
  return (
    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#0D4E5E" }}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 1.5L14.5 8L8 14.5L1.5 8L8 1.5Z" fill="white" />
      </svg>
    </div>
  )
}

export function TabNav() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push(config.routes.login)
  }

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-[#EAEFF0] h-16">
      <div className="mx-auto max-w-[960px] px-6 h-full flex items-center justify-between">
        {/* Brand */}
        <Link href={config.routes.findLeads} className="flex items-center gap-2.5">
          <DiamondLogo />
          <span
            className="font-bold text-[#0D4E5E] text-lg leading-none"
            style={{ fontFamily: "var(--font-inter-tight, 'Inter Tight', sans-serif)" }}
          >
            {config.app.name}
          </span>
        </Link>

        {/* Primary navigation */}
        <nav aria-label="Primary" className="flex items-center">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative px-4 py-1.5 text-sm font-medium rounded-lg transition-colors",
                  active
                    ? "text-[#0D4E5E]"
                    : "text-[#5F7378] hover:text-[#0D4E5E] hover:bg-[#F4F7F8]",
                )}
              >
                {item.label}
                {active && (
                  <span
                    className="absolute -bottom-[18px] left-0 right-0 h-[2.5px] rounded-t-full"
                    style={{ background: "#0F586A" }}
                  />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          <button
            aria-label="Notifications"
            className="w-9 h-9 flex items-center justify-center rounded-full text-[#5F7378] hover:bg-[#F4F7F8] transition-colors"
          >
            <Bell className="h-5 w-5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold select-none cursor-pointer focus:outline-none"
                style={{ background: "#0D4E5E" }}
                aria-label="User menu"
              >
                DM
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
