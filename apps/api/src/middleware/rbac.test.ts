import { describe, it, expect } from 'vitest'
import { canAccess } from '@rxflow/types'

describe('canAccess (role matrix)', () => {
  it('viewers are read-only', () => {
    expect(canAccess('VIEWER', 'GET', '/api/v1/orders')).toBe(true)
    expect(canAccess('VIEWER', 'POST', '/api/v1/orders')).toBe(false)
    expect(canAccess('VIEWER', 'DELETE', '/api/v1/customers/:id')).toBe(false)
  })

  it('salaries and payroll are finance-only', () => {
    expect(canAccess('PHARMACIST', 'GET', '/api/v1/hr/payroll')).toBe(false)
    expect(canAccess('ACCOUNTANT', 'GET', '/api/v1/hr/payroll')).toBe(true)
    expect(canAccess('ACCOUNTANT', 'POST', '/api/v1/hr/payroll/payslip/:id/pay')).toBe(true)
    expect(canAccess('STORE_MANAGER', 'POST', '/api/v1/hr/employees')).toBe(true)
    expect(canAccess('ACCOUNTANT', 'POST', '/api/v1/hr/employees')).toBe(false)
  })

  it('billing roles can sell; delivery staff can only move order status', () => {
    expect(canAccess('SALES_REP', 'POST', '/api/v1/orders')).toBe(true)
    expect(canAccess('PHARMACIST', 'POST', '/api/v1/invoices/from-order/:orderId')).toBe(true)
    expect(canAccess('DELIVERY_STAFF', 'PATCH', '/api/v1/orders/:id/status')).toBe(true)
    expect(canAccess('DELIVERY_STAFF', 'POST', '/api/v1/orders')).toBe(false)
  })

  it('stock changes need stock roles', () => {
    expect(canAccess('PHARMACIST', 'POST', '/api/v1/inventory/batches')).toBe(true)
    expect(canAccess('SALES_REP', 'POST', '/api/v1/inventory/batches')).toBe(false)
    expect(canAccess('ACCOUNTANT', 'PUT', '/api/v1/medicines/:id')).toBe(false)
  })

  it('workspace administration is admin-only', () => {
    expect(canAccess('STORE_MANAGER', 'PATCH', '/api/v1/tenant')).toBe(false)
    expect(canAccess('TENANT_ADMIN', 'DELETE', '/api/v1/tenant/')).toBe(true)
    expect(canAccess('STORE_MANAGER', 'GET', '/api/v1/backup/export')).toBe(false)
  })

  it('live-sync replay stays open while the audit log is restricted', () => {
    expect(canAccess('VIEWER', 'GET', '/api/v1/audit-logs/since')).toBe(true)
    expect(canAccess('VIEWER', 'GET', '/api/v1/audit-logs')).toBe(false)
  })

  it('unlisted writes fail closed; super admin can do anything', () => {
    expect(canAccess('PHARMACIST', 'POST', '/api/v1/some-new-thing')).toBe(false)
    expect(canAccess('SUPER_ADMIN', 'DELETE', '/api/v1/tenant/')).toBe(true)
    expect(canAccess(undefined, 'GET', '/api/v1/orders')).toBe(false)
  })
})
