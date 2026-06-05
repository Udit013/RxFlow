'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Search, Trash2, Plus, Minus, ShoppingCart, Receipt, UserCheck, Pause, Play, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { authService } from '@/lib/auth'
import { cn, debounce, formatCurrency } from '@/lib/utils'

interface InventoryItem {
  id: string
  medicineId: string
  availableQuantity: number
  sellingPrice: number
  medicine: { id: string; name: string; strength: string; dosageForm: string; gstRate: number; mrp: number; schedule: string }
  batches: Array<{ id: string; batchNumber: string; expiryDate: string; quantity: number; mrp: number }>
}

interface CartLine {
  medicineId: string
  name: string
  strength: string
  batchId?: string
  quantity: number
  unitPrice: number
  taxRate: number
  available: number
}

interface Customer { id: string; name: string; phone: string }
interface SalesRep { id: string; name: string; defaultCommissionPercent: number }

const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'CREDIT'] as const

export default function BillingPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [storeId, setStoreId] = useState<string | null>(null)
  const [prefillApplied, setPrefillApplied] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [salesRep, setSalesRep] = useState<SalesRep | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<typeof PAYMENT_METHODS[number]>('CASH')

  useEffect(() => {
    const user = authService.getStoredUser()
    const primary = user?.stores?.find((s) => s.isPrimary) ?? user?.stores?.[0]
    if (primary) setStoreId(primary.id)
  }, [])

  useEffect(() => {
    const fn = debounce((v: string) => setDebouncedSearch(v), 250)
    fn(search)
  }, [search])

  // Prefill from URL params: /dashboard/billing?customerId=X&items=medId:qty,medId:qty
  useEffect(() => {
    if (prefillApplied || !storeId) return
    const customerId = searchParams.get('customerId')
    const itemsStr = searchParams.get('items')
    if (!customerId && !itemsStr) return
    setPrefillApplied(true)

    ;(async () => {
      try {
        // Load customer
        if (customerId) {
          const cRes = await api.get(`/customers/${customerId}`)
          const c = cRes.data?.data
          if (c) setCustomer({ id: c.id, name: c.name, phone: c.phone })
        }
        // Load items: for each medId fetch its inventory item
        if (itemsStr) {
          const pairs = itemsStr.split(',').map((p) => p.split(':')).filter((p) => p.length === 2)
          if (pairs.length === 0) return
          const invRes = await api.get('/inventory', { params: { limit: 200 } })
          const allInv: InventoryItem[] = invRes.data?.data ?? []
          const newCart: CartLine[] = []
          let missing: string[] = []
          for (const [medId, qtyStr] of pairs) {
            const qty = Math.max(1, parseInt(qtyStr ?? '1', 10) || 1)
            const inv = allInv.find((i) => i.medicineId === medId)
            if (!inv) { missing.push(medId); continue }
            const cappedQty = Math.min(qty, inv.availableQuantity)
            if (cappedQty <= 0) { missing.push(inv.medicine.name); continue }
            newCart.push({
              medicineId: inv.medicineId,
              name: inv.medicine.name,
              strength: inv.medicine.strength,
              batchId: inv.batches[0]?.id,
              quantity: cappedQty,
              unitPrice: inv.sellingPrice,
              taxRate: inv.medicine.gstRate ?? 12,
              available: inv.availableQuantity,
            })
          }
          if (newCart.length > 0) setCart(newCart)
          if (missing.length > 0) {
            toast.warning(`${missing.length} item(s) skipped (no stock or not found)`)
          } else if (newCart.length > 0) {
            toast.success(`Prefilled ${newCart.length} item(s) — review and complete the sale`)
          }
        }
      } catch (e: any) {
        toast.error('Failed to prefill from URL')
      }
    })()
  }, [storeId, searchParams, prefillApplied])

  const { data: inventoryData } = useQuery({
    queryKey: ['pos-inventory', debouncedSearch],
    queryFn: () =>
      api.get('/inventory', { params: { search: debouncedSearch || undefined, limit: 10 } }).then((r) => r.data),
    enabled: debouncedSearch.length >= 2,
  })

  const { data: customersData } = useQuery({
    queryKey: ['pos-customers', customerSearch],
    queryFn: () =>
      api.get('/customers', { params: { search: customerSearch, limit: 5 } }).then((r) => r.data),
    enabled: customerSearch.length >= 2,
  })

  const { data: salesRepsData } = useQuery({
    queryKey: ['pos-sales-reps'],
    queryFn: () => api.get('/sales-reps', { params: { active: 'true', limit: 50 } }).then((r) => r.data),
  })
  const salesReps: SalesRep[] = salesRepsData?.data ?? []

  const inventoryResults: InventoryItem[] = inventoryData?.data ?? []
  const customerResults: Customer[] = customersData?.data ?? []

  const allowNegativeStock = authService.getStoredUser()?.tenant?.allowNegativeStock ?? false

  function addToCart(item: InventoryItem) {
    if (item.availableQuantity <= 0 && !allowNegativeStock) {
      toast.error('Out of stock')
      return
    }
    if (item.availableQuantity <= 0 && allowNegativeStock) {
      toast.warning('Stock will go negative — record purchase soon')
    }
    setCart((prev) => {
      const existing = prev.find((l) => l.medicineId === item.medicineId)
      if (existing) {
        if (existing.quantity + 1 > item.availableQuantity && !allowNegativeStock) {
          toast.error('Not enough stock')
          return prev
        }
        return prev.map((l) => l.medicineId === item.medicineId ? { ...l, quantity: l.quantity + 1 } : l)
      }
      return [...prev, {
        medicineId: item.medicineId,
        name: item.medicine.name,
        strength: item.medicine.strength,
        batchId: item.batches[0]?.id,
        quantity: 1,
        unitPrice: item.sellingPrice,
        taxRate: item.medicine.gstRate ?? 12,
        available: item.availableQuantity,
      }]
    })
    setSearch('')
    setDebouncedSearch('')
  }

  function updateQty(medicineId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) =>
          l.medicineId === medicineId
            ? {
                ...l,
                quantity: allowNegativeStock
                  ? Math.max(0, l.quantity + delta)
                  : Math.max(0, Math.min(l.available, l.quantity + delta)),
              }
            : l
        )
        .filter((l) => l.quantity > 0)
    )
  }

  function removeFromCart(medicineId: string) {
    setCart((prev) => prev.filter((l) => l.medicineId !== medicineId))
  }

  function updatePrice(medicineId: string, price: number) {
    setCart((prev) => prev.map((l) => l.medicineId === medicineId ? { ...l, unitPrice: price } : l))
  }

  const subtotal = cart.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0)
  const tax = cart.reduce((sum, l) => sum + (l.quantity * l.unitPrice * l.taxRate) / 100, 0)
  const total = subtotal + tax

  const [showParkedList, setShowParkedList] = useState(false)

  const { data: parkedData, refetch: refetchParked } = useQuery({
    queryKey: ['parked-orders'],
    queryFn: () => api.get('/orders/parked').then((r) => r.data),
  })
  const parkedOrders: any[] = parkedData?.data ?? []

  const parkMut = useMutation({
    mutationFn: (label: string) => {
      if (!storeId) throw new Error('No store assigned')
      return api.post('/orders/park', {
        storeId,
        label,
        customerId: customer?.id,
        salesRepId: salesRep?.id,
        paymentMethod,
        items: cart.map((l) => ({
          medicineId: l.medicineId, batchId: l.batchId, quantity: l.quantity,
          unitPrice: l.unitPrice, discountPercent: 0, taxRate: l.taxRate,
        })),
      })
    },
    onSuccess: () => {
      toast.success('Sale parked — recall it anytime')
      setCart([])
      setCustomer(null)
      setSalesRep(null)
      refetchParked()
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed to park'),
  })

  function parkCart() {
    if (cart.length === 0) {
      toast.error('Cart is empty')
      return
    }
    const label = window.prompt('Label for this parked sale (so you can recognize it later):', customer?.name ?? `Cart ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`)
    if (!label) return
    parkMut.mutate(label)
  }

  function recallParked(o: any) {
    if (cart.length > 0 && !window.confirm('Current cart has items — discard and recall this parked sale?')) return
    const recalledLines: CartLine[] = (o.items ?? []).map((it: any) => ({
      medicineId: it.medicineId,
      name: it.medicine?.name ?? '',
      strength: it.medicine?.strength ?? '',
      batchId: it.batchId ?? undefined,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      taxRate: it.taxRate,
      available: it.quantity * 10, // permissive — we don't refetch inventory here, server will re-validate on checkout
    }))
    setCart(recalledLines)
    if (o.customer) setCustomer({ id: o.customer.id, name: o.customer.name, phone: o.customer.phone })
    setShowParkedList(false)
    // Discard the parked record now that it's loaded
    api.delete(`/orders/${o.id}/parked`).then(() => refetchParked()).catch(() => {})
    toast.success(`Recalled: ${o.parkedLabel ?? o.orderNumber}`)
  }

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      if (!storeId) throw new Error('No store assigned to user')
      const orderRes = await api.post('/orders', {
        type: 'SALE',
        storeId,
        customerId: customer?.id,
        salesRepId: salesRep?.id,
        paymentMethod,
        items: cart.map((l) => ({
          medicineId: l.medicineId,
          batchId: l.batchId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountPercent: 0,
          taxRate: l.taxRate,
        })),
      })
      const orderId = orderRes.data.data.id
      try {
        await api.post(`/invoices/from-order/${orderId}`, {})
      } catch {
        // invoice gen failure is non-fatal; order is created
      }
      return orderId
    },
    onSuccess: (orderId) => {
      toast.success('Sale completed')
      setCart([])
      setCustomer(null)
      setSalesRep(null)
      router.push(`/dashboard/orders/${orderId}`)
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? e.message ?? 'Checkout failed'),
  })

  return (
    <div className="grid grid-cols-3 gap-5 h-full">
      {/* Left: search + results */}
      <div className="col-span-2 space-y-4">
        <div className="page-header">
          <div>
            <h1 className="page-title">Billing / POS</h1>
            <p className="text-sm text-slate-500">Quick sale checkout</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowParkedList(true)}
              className="btn-secondary relative"
              title="Recall a parked sale"
            >
              <Play className="w-4 h-4" /> Parked
              {parkedOrders.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-brand-600 text-white text-[10px] font-semibold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                  {parkedOrders.length}
                </span>
              )}
            </button>
            <button
              onClick={parkCart}
              disabled={cart.length === 0 || parkMut.isPending}
              className="btn-secondary"
              title="Park current cart for later"
            >
              <Pause className="w-4 h-4" /> Park sale
            </button>
          </div>
        </div>

        <div className="card p-3">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400 ml-1" />
            <input
              autoFocus
              className="flex-1 text-sm outline-none"
              placeholder="Scan barcode or search medicine..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {debouncedSearch.length >= 2 && (
          <div className="card overflow-hidden">
            {inventoryResults.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">No matches</div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {inventoryResults.map((item) => (
                  <li
                    key={item.id}
                    onClick={() => addToCart(item)}
                    className="p-3 hover:bg-brand-50 cursor-pointer flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{item.medicine.name}</p>
                      <p className="text-xs text-slate-500">
                        {item.medicine.strength} • {item.medicine.dosageForm} •
                        <span className={cn('ml-1', item.availableQuantity <= 0 ? 'text-red-600' : 'text-slate-500')}>
                          {item.availableQuantity} in stock
                        </span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">{formatCurrency(item.sellingPrice)}</p>
                      <p className="text-xs text-slate-400">MRP {formatCurrency(item.medicine.mrp)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Cart table */}
        <div className="card overflow-hidden">
          <div className="card-header flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" /> Cart ({cart.length})
            </h3>
            {cart.length > 0 && (
              <button onClick={() => setCart([])} className="text-xs text-slate-500 hover:text-red-600">Clear all</button>
            )}
          </div>
          {cart.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-40" />
              Add medicines to begin
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase text-slate-500">
                  <th className="text-left px-4 py-2">Item</th>
                  <th className="text-center px-4 py-2">Qty</th>
                  <th className="text-right px-4 py-2">Price (₹)</th>
                  <th className="text-right px-4 py-2">Total</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cart.map((l) => (
                  <tr key={l.medicineId}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{l.name}</p>
                      <p className="text-xs text-slate-500">{l.strength} • GST {l.taxRate}%</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => updateQty(l.medicineId, -1)} className="w-6 h-6 rounded border border-slate-200 hover:bg-slate-50 flex items-center justify-center"><Minus className="w-3 h-3" /></button>
                        <span className="font-medium w-8 text-center">{l.quantity}</span>
                        <button onClick={() => updateQty(l.medicineId, 1)} className="w-6 h-6 rounded border border-slate-200 hover:bg-slate-50 flex items-center justify-center"><Plus className="w-3 h-3" /></button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        step="0.01"
                        className="w-24 text-right border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                        value={l.unitPrice}
                        onChange={(e) => updatePrice(l.medicineId, parseFloat(e.target.value) || 0)}
                      />
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(l.quantity * l.unitPrice)}</td>
                    <td className="px-2 py-3 text-right">
                      <button onClick={() => removeFromCart(l.medicineId)} className="text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Right: checkout panel */}
      <div className="card p-5 space-y-4 h-fit sticky top-0">
        <h3 className="font-semibold text-slate-900">Checkout</h3>

        <div>
          <label className="label">Customer (optional)</label>
          {customer ? (
            <div className="flex items-center justify-between p-2 bg-brand-50 rounded-lg">
              <div>
                <p className="font-medium text-sm">{customer.name}</p>
                <p className="text-xs text-slate-500">{customer.phone}</p>
              </div>
              <button onClick={() => setCustomer(null)} className="text-xs text-slate-500 hover:text-red-600">Remove</button>
            </div>
          ) : (
            <>
              <input
                className="input"
                placeholder="Search by name or phone..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
              {customerSearch.length >= 2 && customerResults.length > 0 && (
                <ul className="mt-1 border border-slate-200 rounded-lg overflow-hidden">
                  {customerResults.map((c) => (
                    <li key={c.id} onClick={() => { setCustomer(c); setCustomerSearch('') }} className="p-2 text-sm hover:bg-slate-50 cursor-pointer">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-slate-500">{c.phone}</p>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <div>
          <label className="label flex items-center gap-1.5"><UserCheck className="w-3.5 h-3.5" /> Sales Rep (commission)</label>
          <select
            className="input"
            value={salesRep?.id ?? ''}
            onChange={(e) => {
              const r = salesReps.find((s) => s.id === e.target.value) ?? null
              setSalesRep(r)
            }}
          >
            <option value="">— None (no commission) —</option>
            {salesReps.map((r) => (
              <option key={r.id} value={r.id}>{r.name} ({r.defaultCommissionPercent}%)</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Payment Method</label>
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m}
                onClick={() => setPaymentMethod(m)}
                className={cn(
                  'px-3 py-2 rounded-lg text-sm font-medium border',
                  paymentMethod === m ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-200 hover:bg-slate-50'
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t pt-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-600">Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-slate-600">Tax</span><span>{formatCurrency(tax)}</span></div>
          <div className="flex justify-between text-base font-bold pt-2 border-t"><span>Total</span><span>{formatCurrency(total)}</span></div>
        </div>

        <button
          onClick={() => checkoutMutation.mutate()}
          disabled={cart.length === 0 || !storeId || checkoutMutation.isPending}
          className="btn-primary w-full"
        >
          <Receipt className="w-4 h-4" />
          {checkoutMutation.isPending ? 'Processing...' : `Complete Sale (${formatCurrency(total)})`}
        </button>

        {!storeId && <p className="text-xs text-red-600">No store assigned to your account</p>}
      </div>

      {showParkedList && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowParkedList(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold">Parked sales</h2>
              <button onClick={() => setShowParkedList(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {parkedOrders.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                  <Pause className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No parked sales</p>
                  <p className="text-xs mt-1">Use &ldquo;Park sale&rdquo; to save a cart for later</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {parkedOrders.map((o) => (
                    <li key={o.id} className="p-3 hover:bg-slate-50 flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{o.parkedLabel ?? o.orderNumber}</p>
                        <p className="text-xs text-slate-500">
                          {o.customer?.name ?? 'Walk-in'} · {o.items?.length ?? 0} items · {formatCurrency(o.total)}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Parked {new Date(o.parkedAt).toLocaleString('en-IN')}</p>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <button onClick={() => recallParked(o)} className="text-xs bg-brand-600 text-white px-2 py-1 rounded hover:bg-brand-700">
                          Recall
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm('Discard this parked sale?')) {
                              api.delete(`/orders/${o.id}/parked`).then(() => { refetchParked(); toast.success('Discarded') })
                            }
                          }}
                          className="text-xs text-red-600 hover:underline px-2 py-1"
                        >
                          Discard
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
