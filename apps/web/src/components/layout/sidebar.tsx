'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useUi } from '@/lib/ui-store'
import { authService } from '@/lib/auth'
import { canAccess } from '@rxflow/types'
import { useT } from '@/lib/i18n'
import { BrandMark } from '@/components/brand-mark'
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
          'fixed inset-0 z-30 bg-ink/25 transition-opacity duration-200 lg:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      />
      <aside
        id="app-sidebar"
        aria-label="Primary"
        className={cn(
          'w-60 lg:w-56 bg-surface-100 border-r border-surface-200 flex flex-col overflow-hidden shrink-0 z-40',
          // < lg: off-canvas drawer that slides in from the left
          'fixed inset-y-0 left-0 transition-transform duration-200 ease-out',
          open ? 'translate-x-0 shadow-elevated' : '-translate-x-full',
          // ≥ lg: a flush column, always in flow
          'lg:relative lg:translate-x-0 lg:shadow-none lg:z-20'
        )}
      >
        {/* Wordmark */}
        <div className="h-12 px-4 flex items-center justify-between shrink-0">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 -mx-1 px-1 py-1 rounded-md focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            <BrandMark />
            <span className="sr-only">Pharmacy OS</span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="lg:hidden -mr-1.5 p-1.5 rounded-md text-surface-500 hover:text-surface-900 hover:bg-surface-200/70 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-600"
            aria-label={t('Close navigation')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 pt-2 pb-4" aria-label="Main navigation">
          {sections.map((section) => (
            <div key={section.label} className="mb-4 last:mb-0">
              <p className="px-2 mb-1 text-[11px] font-medium text-surface-500">
                {t(section.label)}
              </p>
              <ul className="space-y-px">
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
                          'flex items-center gap-2.5 h-9 lg:h-7 px-2 rounded-md text-[14px] lg:text-[13px] transition-colors',
                          'focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-600',
                          isActive
                            ? 'bg-paper text-surface-950 font-medium shadow-[0_0_0_1px_var(--color-surface-200)]'
                            : 'text-surface-600 hover:bg-surface-200/60 hover:text-surface-950'
                        )}
                      >
                        <item.icon
                          aria-hidden="true"
                          strokeWidth={isActive ? 2.1 : 1.8}
                          className={cn('w-4 h-4 shrink-0', isActive ? 'text-brand-700' : 'text-surface-400')}
                        />
                        <span className="truncate">{t(item.label)}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="px-4 py-2.5 border-t border-surface-200">
          <p className="text-[11px] text-surface-400 font-mono">v1 · book of record</p>
        </div>
      </aside>
    </>
  )
}
