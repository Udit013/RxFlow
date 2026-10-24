#!/usr/bin/env python3
"""
End-to-end API smoke test — runs against a LOCAL API backed by a throwaway database.

    # fresh DB → schema + migrations + demo seed
    DATABASE_URL=postgresql://…localhost… DIRECT_URL=… bash packages/db/scripts/deploy-db.sh
    # start the API (any JWT secrets ≥32 chars)
    cd apps/api && DATABASE_URL=… JWT_SECRET=… JWT_REFRESH_SECRET=… NODE_ENV=test tsx src/server.ts
    # run
    python3 scripts/e2e/api_smoke.py            # API_URL defaults to http://localhost:3001/api/v1

It creates tenants, users and documents, so it refuses to run against anything but localhost.
Uses the demo login from packages/db/prisma/seed.ts. Exit code 1 on any failure.
"""
import json, os, re, sys, urllib.request, urllib.error
from urllib.parse import urlparse

B = os.environ.get('API_URL', 'http://localhost:3001/api/v1')
if urlparse(B).hostname not in ('localhost', '127.0.0.1'):
    sys.exit(f'Refusing to run against {B}: this test writes data. Point API_URL at a local API.')

ok = bad = 0
def check(name, cond, extra=''):
    global ok, bad
    if cond: ok += 1; print('PASS', name)
    else: bad += 1; print('FAIL', name, extra)

def req(method, path, body=None, token=None, cookie=None):
    data = json.dumps(body).encode() if body is not None else None
    h = {'Content-Type': 'application/json'} if data is not None else {}
    if token: h['Authorization'] = 'Bearer ' + token
    if cookie: h['Cookie'] = 'rxflow_rt=' + cookie
    r = urllib.request.Request(B + path, data=data, method=method, headers=h)
    try:
        resp = urllib.request.urlopen(r); code, raw, hdr = resp.status, resp.read(), resp.headers
    except urllib.error.HTTPError as e:
        code, raw, hdr = e.code, e.read(), e.headers
    try: j = json.loads(raw or b'{}')
    except Exception: j = {}
    sc = hdr.get_all('Set-Cookie') or []
    ck = next((c.split(';')[0].split('=', 1)[1] for c in sc if c.startswith('rxflow_rt=')), None)
    return code, j, sc, ck

def login(email, password):
    code, j, sc, rt = req('POST', '/auth/login', {'email': email, 'password': password})
    return code, j, sc, rt

# ── Sessions ──────────────────────────────────────────────────────────────────
code, j, sc, rt = login('ADMIN@rxflow.in', 'admin123')
check('login (case-insensitive email)', code == 200, code)
A = j['data']['accessToken']; store = j['data']['user']['stores'][0]['id']
check('no refresh token in the response body', 'refreshToken' not in j['data'])
check('refresh cookie: HttpOnly, SameSite=Strict, auth path', sc and all(x in sc[0] for x in ('HttpOnly', 'SameSite=Strict', 'Path=/api/v1/auth')), sc)
code, j, _, _ = login('admin@rxflow.in', 'wrong-password')
check('wrong password → 401 Invalid credentials', code == 401 and j.get('error') == 'Invalid credentials', (code, j))
code, j, _, rt2 = req('POST', '/auth/refresh', {}, cookie=rt)
check('refresh rotates the cookie', code == 200 and rt2 and rt2 != rt, code)
check('rotated-out cookie rejected', req('POST', '/auth/refresh', {}, cookie=rt)[0] == 401)
check('refresh token not usable as access token', req('GET', '/orders', token=rt2)[0] == 401)
A = j['data']['accessToken']
_, _, _, d1 = login('admin@rxflow.in', 'admin123')
_, _, _, d2 = login('admin@rxflow.in', 'admin123')
_, _, _, d1n = req('POST', '/auth/refresh', {}, cookie=d1)
req('POST', '/auth/logout', {}, cookie=d1n)
check('logout ends only that device', req('POST', '/auth/refresh', {}, cookie=d1n)[0] == 401 and req('POST', '/auth/refresh', {}, cookie=d2)[0] == 200)

# ── Roles ─────────────────────────────────────────────────────────────────────
code, j, _, _ = req('POST', '/tenant/users', {'name': 'Viv Viewer', 'email': 'viewer@e2e.test', 'phone': '9999999999', 'password': 'viewpass1', 'role': 'VIEWER', 'storeIds': [store]}, token=A)
check('admin creates a viewer', code == 201, (code, j))
V = login('viewer@e2e.test', 'viewpass1')[1]['data']['accessToken']
check('viewer can read', req('GET', '/orders', token=V)[0] == 200)
check('viewer cannot sell (403)', req('POST', '/orders', {'type': 'SALE', 'storeId': store, 'items': [{'medicineId': 'x', 'quantity': 1, 'unitPrice': 1}]}, token=V)[0] == 403)
check('viewer cannot read payroll (403)', req('GET', '/hr/payroll', token=V)[0] == 403)

# ── India: catalog, billing, GST ──────────────────────────────────────────────
code, j, _, _ = req('GET', '/medicines?limit=100', token=A)
meds = j['data']; m = meds[0]
check('IN: sees the shared Indian catalog', len(meds) >= 10 and m.get('isShared') is True, len(meds))
code, j, _, _ = req('PUT', f"/medicines/{m['id']}", {'mrp': 123.45}, token=A)
check('editing a shared medicine creates a private copy', j.get('forked') is True, j)
mid = j['data']['id']
ids = [x['id'] for x in req('GET', '/medicines?limit=100', token=A)[1]['data']]
check('copy replaces the original in this catalog', mid in ids and m['id'] not in ids)
code, j, _, _ = req('POST', f'/inventory/batches?storeId={store}', {'medicineId': mid, 'batchNumber': 'B1', 'expiryDate': '2030-01-01', 'quantity': 50, 'purchasePrice': 50, 'mrp': 130}, token=A)
check('add stock', code in (200, 201), (code, j))
code, j, _, _ = req('POST', '/orders', {'type': 'SALE', 'storeId': store, 'paymentMethod': 'UPI', 'specialDiscount': {'type': 'PERCENT', 'value': 10}, 'items': [{'medicineId': mid, 'quantity': 2, 'unitPrice': 100, 'taxRate': 12}]}, token=A)
order = j['data']; check('IN: sale with UPI + special discount', code in (200, 201), (code, j))
code, j, _, _ = req('POST', f"/invoices/from-order/{order['id']}", {}, token=A); inv = j['data']
check('IN: CGST+SGST, whole-rupee rounding, invoice = order total', abs(inv['cgst'] - 10.8) < .01 and abs(inv['sgst'] - 10.8) < .01 and inv['igst'] == 0 and inv['grandTotal'] == round(order['total']), (inv['cgst'], inv['grandTotal'], order['total']))
check('IN: generic tax breakdown stored too', [c['code'] for c in inv['taxBreakdown']] == ['CGST', 'SGST'])
check('IN: April fiscal-year numbering', re.match(r'^INV/\d{4}-\d{2}/\d{5}$', inv['invoiceNumber']) is not None, inv['invoiceNumber'])
check('invoicing is idempotent per order', req('POST', f"/invoices/from-order/{order['id']}", {}, token=A)[1]['data']['id'] == inv['id'])
code, j, _, _ = req('POST', f"/invoices/{inv['id']}/payment", {'amount': inv['grandTotal'] + 100, 'method': 'CASH'}, token=A)
check('overpayment rejected (₹)', code == 400 and '₹' in j.get('error', ''), j)
check('exact payment accepted', req('POST', f"/invoices/{inv['id']}/payment", {'amount': inv['grandTotal'], 'method': 'CASH'}, token=A)[0] == 201)
check('fully paid invoice refuses more', req('POST', f"/invoices/{inv['id']}/payment", {'amount': 1, 'method': 'CASH'}, token=A)[0] == 400)
code, j, _, _ = req('POST', f"/invoices/{inv['id']}/credit-note", {'reason': 'return', 'items': [{'invoiceItemId': inv['items'][0]['id'], 'quantity': 1}]}, token=A)
check('IN: credit note pro-rates GST', code == 201 and abs(j['data']['totalTax'] - 10.8) < .01, (code, j))
code, j, _, _ = req('POST', '/orders', {'type': 'SALE', 'storeId': store, 'items': [{'medicineId': mid, 'quantity': 9999, 'unitPrice': 100}]}, token=A)
check('insufficient stock → 400 with message', code == 400 and 'Insufficient stock' in j.get('error', ''), (code, j))
p1 = req('POST', '/orders/park', {'storeId': store, 'label': 'p1', 'items': [{'medicineId': mid, 'quantity': 1, 'unitPrice': 100}]}, token=A)[1]['data']['id']
req('POST', '/orders/park', {'storeId': store, 'label': 'p2', 'items': [{'medicineId': mid, 'quantity': 1, 'unitPrice': 100}]}, token=A)
req('DELETE', f'/orders/{p1}/parked', token=A)
check('sale after deleting a parked sale gets a fresh number', req('POST', '/orders', {'type': 'SALE', 'storeId': store, 'items': [{'medicineId': mid, 'quantity': 1, 'unitPrice': 100}]}, token=A)[0] in (200, 201))
period = inv['createdAt'][:7]
check('IN: GSTR-1 available', req('GET', f'/reports/gstr1?period={period}', token=A)[0] == 200)
code, j, _, _ = req('GET', f'/reports/tax-summary?period={period}', token=A)
check('IN: tax summary', code == 200 and j['data']['outputTax'] > 0, j.get('data'))
code, j, _, _ = req('GET', '/reports/schedule-h1-register', token=A)
check('IN: H1 register (original path)', code == 200 and j['meta']['registerName'] == 'Schedule H1 register', j.get('meta'))
code, j, _, _ = req('GET', '/dashboard', token=A)
check('dashboard (timezone-aware today)', code == 200 and j['data']['today']['sales'] > 0, j.get('data', {}).get('today'))
check('analytics', req('GET', '/dashboard/analytics/sales?period=7d', token=A)[0] == 200)
code, j, _, _ = req('POST', '/customers', {'name': 'Bad', 'phone': '9876543210', 'gstin': 'XYZ'}, token=A)
check('IN: invalid GSTIN → 422 field error', code == 422 and j['details'][0]['field'] == 'gstin', j)
code, j, _, _ = req('POST', '/customers', {'name': 'Guj Co', 'phone': '+91 98765 43210', 'state': 'Gujarat', 'gstin': '27aaacr5055k1zv'}, token=A)
check('IN: valid GSTIN normalised', code == 201 and j['data']['gstin'] == '27AAACR5055K1ZV', (code, j))
# ── Partial updates must not reset fields that weren't sent ──────────────────
cust = req('POST', '/customers', {'name': 'Keep Fields', 'phone': '9812345678', 'creditLimit': 5000, 'tags': ['vip'], 'notes': 'n'}, token=A)[1]['data']
req('PUT', f"/customers/{cust['id']}", {'name': 'Renamed'}, token=A)
after = req('GET', f"/customers/{cust['id']}", token=A)[1]['data']
check('customer edit keeps unsent fields', after['name'] == 'Renamed' and after['creditLimit'] == 5000 and after['tags'] == ['vip'], after)
hm = next(x for x in req('GET', '/medicines?limit=100', token=A)[1]['data'] if x['schedule'] == 'SCHEDULE_H')
mcopy = req('PUT', f"/medicines/{hm['id']}", {'mrp': 77}, token=A)[1]['data']
check('medicine edit keeps schedule, form and barcodes', mcopy['mrp'] == 77 and mcopy['schedule'] == 'SCHEDULE_H' and mcopy['dosageForm'] == hm['dosageForm'] and mcopy['barcodes'] == hm['barcodes'], (mcopy.get('schedule'), mcopy.get('dosageForm')))
sup = req('POST', '/suppliers', {'name': 'S', 'companyName': 'S Co', 'phone': '9812345679', 'creditDays': 45, 'creditLimit': 9000}, token=A)[1]['data']
req('PUT', f"/suppliers/{sup['id']}", {'name': 'S2'}, token=A)
sa = req('GET', f"/suppliers/{sup['id']}", token=A)[1]['data']
check('supplier edit keeps credit terms', sa['creditDays'] == 45 and sa['creditLimit'] == 9000, (sa.get('creditDays'), sa.get('creditLimit')))
req('PATCH', '/tenant', {'state': 'Maharashtra'}, token=A)
oid = req('POST', '/orders', {'type': 'SALE', 'storeId': store, 'customerId': j['data']['id'], 'items': [{'medicineId': mid, 'quantity': 1, 'unitPrice': 100, 'taxRate': 12}]}, token=A)[1]['data']['id']
ij = req('POST', f'/invoices/from-order/{oid}', {}, token=A)[1]['data']
check('IN: Maharashtra → Gujarat is IGST', abs(ij['igst'] - 12) < .01 and ij['cgst'] == 0, (ij['igst'], ij['cgst']))
code, j, _, _ = req('POST', '/medicine-intelligence/search', {'query': 'dolo 650'}, token=A)
check('IN: fuzzy search finds Dolo', code == 200 and any('Dolo' in x.get('name', '') for x in j['data']))

# ── United States ─────────────────────────────────────────────────────────────
code, j, _, _ = req('POST', '/auth/register', {'pharmacyName': 'Brooklyn Rx', 'name': 'Ann', 'email': 'ann@e2e.test', 'password': 'annpass123', 'phone': '+1 (212) 555-0100', 'country': 'US'})
check('US: register', code == 201, (code, j))
U = j['data']['accessToken']; t = j['data']['user']['tenant']; ustore = j['data']['user']['stores'][0]['id']
check('US: defaults', (t['currency'], t['timezone'], t['fiscalYearStartMonth']) == ('USD', 'America/New_York', 1), t)
check("US: doesn't see India's catalog", len(req('GET', '/medicines?limit=100', token=U)[1]['data']) == 0)
um = req('POST', '/medicines', {'name': 'Tylenol', 'manufacturerName': 'J&J', 'hsn': '3004', 'schedule': 'SCHEDULE_H'}, token=U)[1]['data']
check('US: medicine is private, 0% default tax, Rx from tier', um['country'] == 'US' and um['gstRate'] == 0 and um['requiresPrescription'] is True, um)
req('POST', f'/inventory/batches?storeId={ustore}', {'medicineId': um['id'], 'batchNumber': 'L1', 'expiryDate': '2030-01-01', 'quantity': 20, 'purchasePrice': 5, 'mrp': 9}, token=U)
code, j, _, _ = req('POST', '/orders', {'type': 'SALE', 'storeId': ustore, 'paymentMethod': 'BANK_TRANSFER', 'items': [{'medicineId': um['id'], 'quantity': 3, 'unitPrice': 3.33, 'taxRate': 8.875}]}, token=U)
check('US: sale by bank transfer', code in (200, 201), (code, j))
ui = req('POST', f"/invoices/from-order/{j['data']['id']}", {}, token=U)[1]['data']
check('US: sales tax only, cents rounding, calendar-year numbering', [c['code'] for c in ui['taxBreakdown']] == ['SALES_TAX'] and ui['grandTotal'] == 10.88 and re.match(r'^INV/\d{4}/\d{5}$', ui['invoiceNumber']), ui)
code, j, _, _ = req('GET', f'/reports/gstr1?period={period}', token=U)
check('US: GSTR-1 refused', code == 400, code)
check("US: fuzzy search excludes India's catalog", all(x.get('country') != 'IN' for x in req('POST', '/medicine-intelligence/search', {'query': 'dolo 650'}, token=U)[1]['data']))
check('US: GSTIN rejected as EIN', req('POST', '/customers', {'name': 'C', 'phone': '2125550100', 'gstin': '27AAACR5055K1ZV'}, token=U)[0] == 422)
check("tenant isolation: US can't bill against India's store", req('POST', '/orders', {'type': 'SALE', 'storeId': store, 'items': [{'medicineId': mid, 'quantity': 1, 'unitPrice': 1}]}, token=U)[0] == 404)
check("tenant isolation: US can't open India's private medicine", req('GET', f'/medicines/{mid}', token=U)[0] == 404)

# ── United Kingdom + Settings ─────────────────────────────────────────────────
code, j, _, _ = req('POST', '/auth/register', {'pharmacyName': 'Camden Chemist', 'name': 'Raj', 'email': 'raj@e2e.test', 'password': 'rajpass123', 'phone': '+44 20 7946 0958', 'country': 'GB'})
G = j['data']['accessToken']; gstore = j['data']['user']['stores'][0]['id']
gm = req('POST', '/medicines', {'name': 'Calpol', 'manufacturerName': 'McNeil', 'hsn': '3004', 'gstRate': 20}, token=G)[1]['data']
req('POST', f'/inventory/batches?storeId={gstore}', {'medicineId': gm['id'], 'batchNumber': 'C1', 'expiryDate': '2030-01-01', 'quantity': 20, 'purchasePrice': 2, 'mrp': 6}, token=G)
go = req('POST', '/orders', {'type': 'SALE', 'storeId': gstore, 'items': [{'medicineId': gm['id'], 'quantity': 2, 'unitPrice': 4.5, 'taxRate': 20}]}, token=G)[1]['data']
gi = req('POST', f"/invoices/from-order/{go['id']}", {}, token=G)[1]['data']
check('GB: VAT 20%', gi['taxBreakdown'] == [{'code': 'VAT', 'label': 'VAT', 'rate': 20, 'amount': 1.8}] and gi['grandTotal'] == 10.8, gi.get('taxBreakdown'))
check('Settings: change currency', req('PATCH', '/tenant', {'currency': 'EUR'}, token=G)[1]['data']['currency'] == 'EUR')
check('Settings: invalid timezone rejected', req('PATCH', '/tenant', {'timezone': 'Mars/Olympus'}, token=G)[0] == 422)
check('Stores: postal code optional', req('POST', '/tenant/stores', {'name': 'Dubai', 'code': 'DXB', 'addressLine1': 'Mall', 'city': 'Dubai', 'state': 'Dubai'}, token=G)[0] == 201)

print(f'\n{ok} passed, {bad} failed')
sys.exit(1 if bad else 0)
