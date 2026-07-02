import { describe, it, expect } from 'vitest'
import { parseFlexibleDate } from './marg-parser'
import { autoDetect, parseWith, looksLikeHtfFormat } from './registry'

// ── Date parsing (formats observed across real distributor exports) ──────────

describe('parseFlexibleDate', () => {
  it('parses 8-digit ddmmyyyy (MARG expiry format)', () => {
    expect(parseFlexibleDate('28022028')).toBe('2028-02-28')
    expect(parseFlexibleDate('01072028')).toBe('2028-07-01')
  })

  it('parses dd/mm/yyyy and dd-mm-yyyy', () => {
    expect(parseFlexibleDate('27/06/2026')).toBe('2026-06-27')
    expect(parseFlexibleDate('27-06-26')).toBe('2026-06-27')
  })

  it('parses mm/yy as the last day of that month', () => {
    expect(parseFlexibleDate('02/28')).toBe('2028-02-29') // 2028 is a leap year
    expect(parseFlexibleDate('12/27')).toBe('2027-12-31')
  })

  it('rejects blanks, zeros, and out-of-range dates', () => {
    expect(parseFlexibleDate('')).toBeUndefined()
    expect(parseFlexibleDate('00000000')).toBeUndefined()
    expect(parseFlexibleDate(undefined)).toBeUndefined()
    expect(parseFlexibleDate('99/99/9999')).toBeUndefined()
  })
})

// ── Real distributor rows (verbatim from live supplier invoices) ─────────────

const split = (lines: string[]) => lines.map((l) => l.split(','))

const BLUESTAR = split([
  'H,1.0,BP/8051,27062026,,,,1,,,BLUE STAR PHARMACEUTICALS,,,,,',
  "T,SIRI,SIRIUS,2857,AMLSTROCTB080000,STROCIT PLUS,10 S,SIRIUS,GKH0119A,28022028,630.54,630.54,827.58,882.78,,3.00,0.00,8.50,160.79,0.00,0.00,,2.50,43.27,0.00,,2.50,43.27,,,30049082,",
  'F,2214.46,188.23,,50.66,,50.66,,,,,,0.00,,,,,,,0.00,0.00,0.00,,2128.00',
])

const TORRENT = split([
  'H,1,26000730067658,27062026,,27062026,,Direct,1,,0,,,CHINSURAH,,0,,0,0,,0,0,0,,,,,,,,,0,0',
  "T,000053,S R MEDICAL,I16802,,METOCARD XL 100 10'S,10'S,TORRENT CND*,2D30N001,31012029,0,,5.00,121.98,121.98,0,160.10,0,0,,2,0,7.00,17.08,,2.50,2.50,0.00,300490,5.67,5.67,0.00,0.00",
  'F,1,571.96,,0,,0.00,,,,0,,,,,0,,0,0,,0,0,0,,559.00,,,,,,,0,0',
])

const LIFELINE = split([
  'H,5,A001853,25062026,,00000000,,1,,25062026,,,25062026,19-WEST BENGAL,0,0,,0,,,,,COUNTER,9475804600,,,S,,ASOC,,S R MEDICAL H.P.ROAD,9836686355,19CGDPA2239J1ZJ,x,x,M ,2,HOSPITAL ROAD,,,0,0,,,,,,,,,,,<MARGERP FORMAT>',
  'T,C1874,FOURTS INDIA LTD.,5964,,SUCRAFIL O GEL,200 ML,,N2474,01022029,0,224.76,295,,0,5,1,7,78.67,0,0,1045.13,2.5,26.13,0,0,2.5,26.13,0,0,3004,0,G,669594,,,MARG5670,3004,SUCRAFIL O GEL,200 ML,224.76,0,0,0,,x,,,,',
  'F,1768,122.07,0,0,0,0,,0,84.22,',
])

describe('format auto-detection', () => {
  it('recognises H/T/F files and rejects normal headered CSVs', () => {
    expect(looksLikeHtfFormat(BLUESTAR)).toBe(true)
    expect(looksLikeHtfFormat(split(['name,qty,price', 'Dolo 650,10,25.5']))).toBe(false)
  })

  it('detects the right parser for each distributor', () => {
    expect(autoDetect(BLUESTAR)?.parser.id).toBe('marg-bluestar')
    expect(autoDetect(TORRENT)?.parser.id).toBe('marg-torrent')
    expect(autoDetect(LIFELINE)?.parser.id).toBe('margerp-lifeline')
  })

  it('returns null (→ manual pick) when nothing parses confidently', () => {
    expect(autoDetect(split(['T,garbage', 'F,0']))).toBeNull()
  })
})

describe('parsing normalizes each format into the shared model', () => {
  it('Blue Star: full line fields', () => {
    const inv = parseWith('marg-bluestar', BLUESTAR)!
    expect(inv.invoiceNumber).toBe('BP/8051')
    expect(inv.invoiceDate).toBe('2026-06-27')
    const l = inv.lines[0]!
    expect(l.productName).toBe('STROCIT PLUS')
    expect(l.batchNumber).toBe('GKH0119A')
    expect(l.expiryDate).toBe('2028-02-28')
    expect(l.purchaseRate).toBe(630.54)
    expect(l.mrp).toBe(882.78)
    expect(l.gstRate).toBe(5) // CGST 2.5 × 2
    expect(l.hsn).toBe('30049082')
  })

  it('Torrent: quantity, discount and GST columns', () => {
    const l = parseWith('marg-torrent', TORRENT)!.lines[0]!
    expect(l.productName).toBe("METOCARD XL 100 10'S")
    expect(l.quantity).toBe(2)
    expect(l.discountPercent).toBe(5)
    expect(l.gstRate).toBe(7)
    expect(l.purchaseRate).toBe(121.98)
  })

  it('Life Line (MARGERP): free quantity and manufacturer', () => {
    const l = parseWith('margerp-lifeline', LIFELINE)!.lines[0]!
    expect(l.productName).toBe('SUCRAFIL O GEL')
    expect(l.manufacturer).toBe('FOURTS INDIA LTD.')
    expect(l.quantity).toBe(5)
    expect(l.freeQuantity).toBe(1)
    expect(l.discountPercent).toBe(7)
    expect(l.mrp).toBe(295)
  })

  it('unknown parser id returns null instead of throwing', () => {
    expect(parseWith('does-not-exist', BLUESTAR)).toBeNull()
  })
})
