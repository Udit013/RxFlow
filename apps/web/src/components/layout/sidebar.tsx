'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Package, ShoppingCart, FileText,
  Users, Truck, Pill, BarChart3, Settings,
  Bell, Search, Store, Receipt, PackagePlus,
  UserCheck, FileSpreadsheet, ClipboardList, History, Database, ArrowLeftRight, ShieldCheck, Wallet, Users2, Tags, RotateCcw,
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
      { href: '/dashboard/purchases/new', icon: PackagePlus, label: 'New Purchase' },
      { href: '/dashboard/purchases/returns', icon: RotateCcw, label: 'Purchase Returns' },
      { href: '/dashboard/billing', icon: FileText, label: 'Billing / POS' },
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
      { href: '/dashboard/staff', icon: Users2, label: 'Staff & Payroll' },
      { href: '/dashboard/stores', icon: Store, label: 'Stores' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { href: '/dashboard/accounts', icon: Wallet, label: 'Accounts' },
      { href: '/dashboard/reports', icon: FileSpreadsheet, label: 'Reports' },
      { href: '/dashboard/compliance', icon: ShieldCheck, label: 'Compliance' },
      { href: '/dashboard/audit', icon: History, label: 'Audit Log' },
      { href: '/dashboard/backup', icon: Database, label: 'Backup & Import' },
      { href: '/dashboard/alerts', icon: Bell, label: 'Alerts' },
      { href: '/dashboard/settings', icon: Settings, label: 'Settings' },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-60 bg-brand-950 flex flex-col h-full overflow-hidden shrink-0">
      {/* Wordmark */}
      <div className="px-5 pt-5 pb-4 border-b border-white/10">
        <div className="flex items-baseline gap-2">
          <Pill className="w-4 h-4 text-brand-300 self-center" />
          <span className="font-display font-bold text-paper text-[19px] tracking-tight">RxFlow</span>
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-300/70 mt-1">Pharmacy OS</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4">
        {navItems.map((section) => (
          <div key={section.label} className="mb-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-300/60 px-5 mb-1.5">
              {section.label}
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
                      className={cn(
                        'relative flex items-center gap-2.5 pl-5 pr-4 py-[7px] text-[13px] transition-colors',
                        // ledger rule: a 2px left marker, not a pill highlight
                        'border-l-2',
                        isActive
                          ? 'border-brand-300 bg-white/[0.06] text-paper font-medium'
                          : 'border-transparent text-brand-100/60 hover:text-brand-50 hover:bg-white/[0.03]'
                      )}
                    >
                      <item.icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-brand-300' : 'text-brand-200/40')} />
                      {item.label}
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
        <p className="text-[10px] text-brand-200/40 tracking-wide font-mono">v1 · book of record</p>
      </div>
    </aside>
  )
}
