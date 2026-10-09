'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useUi } from '@/lib/ui-store'
import { authService } from '@/lib/auth'
import { canAccess } from '@rxflow/types'
import { useT } from '@/lib/i18n'
import {
  LayoutDashboard, Package, ShoppingCart, FileText,
  Users, Truck, Pill, BarChart3, Settings,
  Bell, Search, Store, Receipt, PackagePlus,
  UserCheck, FileSpreadsheet, ClipboardList, History, Database, ArrowLeftRight, ShieldCheck, Wallet, Users2, Tags, RotateCcw, X,
} from 'lucide-react'

const navItems = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { href: '/dashboard/analytics', icon: BarChart3, label: 'Analytics' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/dashboard/inventory', icon: Package, label: 'Inventory' },
      { href: '/dashboard/stock-takes', icon: ClipboardList, label: 'Stock Takes' },
      { href: '/dashboard/stock-transfers', icon: ArrowLeftRight, label: 'Stock Transfers' },
      { href: '/dashboard/orders', icon: ShoppingCart, label: 'Orders' },
      { href: '/dashboard/purchases/new', icon: PackagePlus, label: 'New Purchase', perm: ['POST', 'purchases/bulk-import'] as const },
      { href: '/dashboard/purchases/returns', icon: RotateCcw, label: 'Purchase Returns', perm: ['POST', 'invoices/:id/purchase-return'] as const },
      { href: '/dashboard/billing', icon: FileText, label: 'Billing / POS', perm: ['POST', 'orders'] as const },
      { href: '/dashboard/invoices', icon: Receipt, label: 'Invoices' },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { href: '/dashboard/medicines', icon: Pill, label: 'Medicines' },
      { href: '/dashboard/categories', icon: Tags, label: 'Categories' },
      { href: '/dashboard/medicine-search', icon: Search, label: 'Medicine Search' },
    ],
  },
  {
    label: 'Stakeholders',
    items: [
      { href: '/dashboard/customers', icon: Users, label: 'Customers' },
      { href: '/dashboard/suppliers', icon: Truck, label: 'Suppliers' },
      { href: '/dashboard/sales-reps', icon: UserCheck, label: 'Sales Reps' },
      { href: '/dashboard/staff', icon: Users2, label: 'Staff & Payroll', perm: ['GET', 'hr/employees'] as const },
      { href: '/dashboard/stores', icon: Store, label: 'Stores' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { href: '/dashboard/accounts', icon: Wallet, label: 'Accounts', perm: ['GET', 'accounts/summary'] as const },
      { href: '/dashboard/reports', icon: FileSpreadsheet, label: 'Reports', perm: ['GET', 'reports/gstr1'] as const },
      { href: '/dashboard/compliance', icon: ShieldCheck, label: 'Compliance', perm: ['GET', 'reports/schedule-h1-register'] as const },
      { href: '/dashboard/audit', icon: History, label: 'Audit Log', perm: ['GET', 'audit-logs'] as const },
      { href: '/dashboard/backup', icon: Database, label: 'Backup & Import', perm: ['POST', 'backup/import-customers'] as const },
      { href: '/dashboard/alerts', icon: Bell, label: 'Alerts' },
      { href: '/dashboard/settings', icon: Settings, label: 'Settings' },
    ],
  },
]

export function Sidebar() {
  const t = useT()
  const pathname = usePathname()
  // Hide destinations the signed-in role can't use (the API enforces the same matrix).
  const [role, setRole] = useState<string | null>(null)
  useEffect(() => { setRole(authService.getStoredUser()?.role ?? null) }, [])
  const sections = navItems
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const perm = (item as { perm?: readonly [string, string] }).perm
        return !perm || !role || canAccess(role, perm[0], perm[1])
      }),
    }))
    .filter((section) => section.items.length > 0)
  const open = useUi((s) => s.mobileNavOpen)
  const setOpen = useUi((s) => s.setMobileNavOpen)

  // Close the mobile drawer after navigating, and on Escape.
  useEffect(() => { setOpen(false) }, [pathname, setOpen])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  return (
    <>
      {/* Scrim — mobile/tablet only, while the drawer is open */}
      <div
        aria-hidden="true"
        onClick={() => setOpen(false)}
        className={cn(
          'fixed inset-0 z-30 bg-ink/40 backdrop-blur-[1px] transition-opacity duration-200 lg:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      />
      <aside
        id="app-sidebar"
        aria-label="Primary"
        className={cn(
          'w-60 bg-brand-950 flex flex-col overflow-hidden shrink-0 rounded-xl shadow-float ring-1 ring-black/20 z-40',
          // < lg: off-canvas drawer that slides in from the left
          'fixed inset-y-3 left-3 transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : '-translate-x-[calc(100%+1rem)]',
          // ≥ lg: the floating panel, always in flow
          'lg:relative lg:inset-auto lg:m-3 lg:translate-x-0 lg:z-20'
        )}
      >
        {/* Wordmark */}
        <div className="px-5 pt-5 pb-4 border-b border-white/10 flex items-start justify-between">
          <Link href="/dashboard" className="rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300">
            <span className="flex items-baseline gap-2">
              <Pill className="w-4 h-4 text-brand-300 self-center" aria-hidden="true" />
              <span className="font-display font-bold text-paper text-[19px] tracking-tight">RxFlow</span>
            </span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-300/70 mt-1">Pharmacy OS</span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="lg:hidden -mr-1.5 p-1.5 rounded-sm text-brand-200/70 hover:text-paper hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            aria-label={t('Close navigation')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4" aria-label="Main navigation">
          {sections.map((section) => (
            <div key={section.label} className="mb-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-300/60 px-5 mb-1.5">
                {t(section.label)}
              </p>
              <ul>
                {section.items.map((item) => {
                  // Exact match for the dashboard root; prefix match for nested routes.
                  const isActive = item.href === '/dashboard'
                    ? pathname === '/dashboard'
                    : pathname === item.href || pathname.startsWith(`${item.href}/`)
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                          'relative flex items-center gap-2.5 pl-5 pr-4 py-[7px] text-[13px] transition-colors',
                          'focus:outline-none focus-visible:bg-white/[0.08] focus-visible:text-paper',
                          // ledger rule: a 2px left marker, not a pill highlight
                          'border-l-2',
                          isActive
                            ? 'border-brand-300 bg-white/[0.06] text-paper font-medium'
                            : 'border-transparent text-brand-100/70 hover:text-brand-50 hover:bg-white/[0.03]'
                        )}
                      >
                        <item.icon aria-hidden="true" className={cn('w-4 h-4 shrink-0', isActive ? 'text-brand-300' : 'text-brand-200/50')} />
                        {t(item.label)}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Footer rule */}
        <div className="px-5 py-3 border-t border-white/10">
          <p className="text-[10px] text-brand-200/50 tracking-wide font-mono">v1 · book of record</p>
        </div>
      </aside>
    </>
  )
}
