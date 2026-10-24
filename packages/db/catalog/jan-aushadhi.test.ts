import { describe, it, expect } from 'vitest'
import { parseJanAushadhi, type JaProduct } from './jan-aushadhi.js'

const parse = (genericName: string, groupName = 'Antibiotics', mrp: number | null = 10) =>
  parseJanAushadhi({ drugCode: 1, genericName, groupName, unitSize: "10's", mrp, status: 1 } as JaProduct, '2026-10-24')
const key = (n: string) => parse(n)?.compositionKey

describe('Jan Aushadhi product names', () => {
  it('reads pharmacopoeia-style names with the strength after the form', () => {
    expect(key('Aceclofenac Tablets IP 100 mg')).toBe('aceclofenac@100mg')
    expect(key('Tizanidine Tablets I.P 2mg')).toBe('tizanidine@2mg')
    expect(key('Cefoperazone Injection IP 1 g')).toBe('cefoperazone@1000mg')
  })
  it('reads combinations, bracketed compositions and Indian spellings', () => {
    expect(key('Paracetamol 325mg and Tramadol 37.5mg Tablets')).toBe('paracetamol@325mg+tramadol@37.5mg')
    expect(key('Co-trimoxazole (Sulphamethoxazole 800mg and Trimethoprim 160mg) Tablets IP')).toBe('sulfamethoxazole@800mg+trimethoprim@160mg')
    expect(key('Amoxycillin Capsules IP 250mg')).toBe('amoxicillin@250mg')
    expect(key('Levocetrizine Tablets IP 5mg')).toBe('levocetirizine@5mg')
  })
  it('applies a trailing "per 5ml" to every ingredient', () => {
    expect(key('Amoxycillin 200mg and Potassium Clavulanate 28.5mg Oral Suspension IP per 5ml')).toBe('amoxicillin@40mg/ml+clavulanic acid@5.7mg/ml')
    expect(key('Labetalol Injection IP 5 mg per ml')).toBe('labetalol@5mg/ml')
  })
  it('derives form, route and release from the name', () => {
    expect(parse('Salbutamol Rotacaps 200mcg')).toMatchObject({ dosageForm: 'INHALER', route: 'Inhalation' })
    expect(parse('Budesonide Respirator Solution 0.5mg per ml')).toMatchObject({ dosageForm: 'SOLUTION', route: 'Inhalation' })
    expect(parse('Insulin Glargine Pre-filled disposable Pen 100 IU per ml')).toMatchObject({ dosageForm: 'INJECTION', route: 'Parenteral' })
    expect(parse('Pantoprazole Sodium 40 mg (Enteric Coated) and Itopride Hydrochloride 150 mg (Sustained Release) Capsules')?.dosageFormDetail).toMatch(/sustained release/)
  })
  it('keeps the official name and MRP, and leaves unreadable compositions unstructured', () => {
    const r = parse('Vitamins A,C,D,E,And B Complex and Minerals Syrup', 'Supplement/Vitamin/Mineral')!
    expect(r.name).toBe('Vitamins A,C,D,E,And B Complex and Minerals Syrup')
    expect(r.ingredients).toEqual([])
    expect(r.schedule).toBe('OTC')
    expect(parse('Aceclofenac Tablets IP 100 mg')).toMatchObject({ mrp: 10, gstRate: 5, schedule: 'SCHEDULE_H', country: 'IN' })
  })
  it('skips non-medicines and products without a published MRP', () => {
    expect(parse('Janaushadhi Poshan (Malt based food, 1000gm)', 'Nutraceuticals')).toBeNull()
    expect(parse('Gauze Swab', 'Surgical & Medical Consumables')).toBeNull()
    expect(parse('Aceclofenac Tablets IP 100 mg', 'Analgesic', 0)).toBeNull()
  })
})
