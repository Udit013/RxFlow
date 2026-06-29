'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Package, ShoppingCart, FileText,
  Users, Truck, Pill, BarChart3, Settings,
  ChevronRight, Bell, Search, Store, Receipt, PackagePlus,
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
    <aside className="w-64 bg-white border-r border-surface-200 flex flex-col h-full overflow-hidden shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-surface-100">
        <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
          <Pill className="w-4.5 h-4.5 text-white" />
        </div>
        <div>
          <span className="font-bold text-surface-900 text-base">RxFlow</span>
          <p className="text-2xs text-surface-500 -mt-0.5">Pharma Network</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5">
        {navItems.map((section) => (
          <div key={section.label} className="mb-5">
            <p className="text-2xs font-semibold text-surface-400 uppercase tracking-wider px-2 mb-1.5">
              {section.label}
            </p>
            <ul className="space-y-0.5">
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
                        'flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors',
                        isActive
                          ? 'bg-brand-50 text-brand-700'
                          : 'text-surface-600 hover:bg-surface-50 hover:text-surface-900'
                      )}
                    >
                      <item.icon className={cn('w-4.5 h-4.5', isActive ? 'text-brand-600' : 'text-surface-400')} />
                      {item.label}
                      {isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto text-brand-400" />}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}
