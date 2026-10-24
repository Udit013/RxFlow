import { describe, it, expect } from 'vitest'
import { buildSearchWhere, groupAlternatives, ingredientsForCreate, textDefaults, type CatalogRow } from './medicine-catalog.js'

const json = (v: unknown) => JSON.stringify(v)

describe('buildSearchWhere', () => {
  it('returns null for blank input', () => {
    expect(buildSearchWhere('   ')).toBeNull()
  })
  it('requires every term to match (AND of ORs)', () => {
    const w = buildSearchWhere('Dolo 650') as { AND: unknown[] }
    expect(w.AND).toHaveLength(2)
  })
  it('turns strengths into structured composition matches', () => {
    const s = json(buildSearchWhere('paracetamol 500mg'))
    expect(s).toContain('"strengthNum":500')
    expect(s).toContain('"unit":"mg"')
    expect(json(buildSearchWhere('amoxicillin 250mg/5ml'))).toContain('"strengthNum":50,"unit":"mg/ml"')
  })
  it('matches dosage-form words against the form', () => {
    expect(json(buildSearchWhere('metformin tab'))).toContain('"dosageForm":"TABLET"')
  })
  it('expands regional ingredient names both ways', () => {
    expect(json(buildSearchWhere('acetaminophen'))).toContain('"paracetamol"')
    expect(json(buildSearchWhere('paracetamol'))).toContain('"acetaminophen"')
  })
  it('maps therapeutic terms and ATC codes to ATC prefixes', () => {
    expect(json(buildSearchWhere('antibiotic'))).toContain('{"atcCode":{"startsWith":"J01"}}')
    expect(json(buildSearchWhere('blood pressure'))).toContain('"C09"')
    expect(json(buildSearchWhere('N02BE'))).toContain('{"atcCode":{"startsWith":"N02BE"}}')
  })
})

describe('creating with compositions', () => {
  it('uses typed ingredients, normalising regional names', () => {
    expect(ingredientsForCreate({ name: 'X', ingredients: [{ name: 'Acetaminophen', strength: 500, unit: 'mg' }] }))
      .toEqual([{ name: 'paracetamol', salt: null, strength: 500, unit: 'mg' }])
  })
  it('falls back to the composition text', () => {
    expect(ingredientsForCreate({ name: 'Pan-D', composition: 'Pantoprazole 40mg + Domperidone 30mg' }).map((i) => i.name)).toEqual(['pantoprazole', 'domperidone'])
  })
  it('fills blank text fields from the ingredients only', () => {
    const ing = [{ name: 'paracetamol', strength: 500, unit: 'mg' }]
    expect(textDefaults(ing, {})).toMatchObject({ composition: 'Paracetamol 500 mg', strength: '500 mg', strengthNumeric: 500 })
    expect(textDefaults(ing, { composition: 'mine', strength: '500mg' })).toEqual({})
  })
})

const row = (over: Partial<CatalogRow>): CatalogRow => ({
  id: 'x', name: 'X', brandName: 'X', genericName: 'X', manufacturerName: 'M', dosageForm: 'TABLET', dosageFormDetail: null,
  route: null, strength: '', packSize: '', mrp: 0, country: 'IN', ownerTenantId: null, dataSource: null, sourceUrl: null,
  isVerified: true, atcCode: 'N02BE01', therapeuticClass: 'Anilides', compositions: [], ...over,
})
const para = (strengthNum: number) => [{ ingredient: 'paracetamol', salt: null, strengthNum, unit: 'mg' }]

describe('groupAlternatives', () => {
  const base = row({ id: 'base', name: 'Dolo 650', compositions: para(650) })
  const ctx = { tenantId: 't1', country: 'IN', stock: new Map([['in-stock', 12]]) }
  const out = groupAlternatives(base, [
    base,
    row({ id: 'same-us', name: 'Tylenol 650', country: 'US', compositions: para(650) }),
    row({ id: 'in-stock', name: 'Calpol 650', compositions: para(650) }),
    row({ id: 'variant', name: 'Crocin 500', compositions: para(500) }),
    row({ id: 'similar', name: 'Aspirin 300', atcCode: 'N02BA01', compositions: [{ ingredient: 'acetylsalicylic acid', salt: null, strengthNum: 300, unit: 'mg' }] }),
    row({ id: 'same-group', name: 'Propacetamol', atcCode: 'N02BE05', compositions: [{ ingredient: 'propacetamol', salt: null, strengthNum: 1000, unit: 'mg' }] }),
    row({ id: 'combo', name: 'Saridon', atcCode: 'N02BE51', compositions: [...para(250), { ingredient: 'caffeine', salt: null, strengthNum: 50, unit: 'mg' }] }),
    row({ id: 'combo', name: 'Saridon (duplicate row from a second query)', compositions: para(250) }),
  ], ctx)

  it('never lists the base product', () => {
    expect([...out.sameComposition, ...out.variants, ...out.similarUse].map((a) => a.id)).not.toContain('base')
  })
  it('groups by relation', () => {
    expect(out.sameComposition.map((a) => a.id)).toEqual(['in-stock', 'same-us'])
    expect(out.variants.map((a) => a.id)).toEqual(['variant'])
    expect(out.similarUse.map((a) => a.id)).toEqual(['same-group']) // N02BE only — aspirin is N02BA
    expect(out.combinations.map((a) => a.id)).toEqual(['combo']) // listed once
    expect(out.combinations[0]!.differences).toContain('Also contains Caffeine')
  })
  it('ranks this market and in-stock products first and marks other markets', () => {
    expect(out.sameComposition[0]).toMatchObject({ id: 'in-stock', inStock: 12, inYourMarket: true })
    expect(out.sameComposition[1]).toMatchObject({ id: 'same-us', inYourMarket: false })
  })
  it('explains every difference and never calls similar-use products interchangeable', () => {
    expect(out.variants[0]!.differences).toContain('Different strength')
    expect(out.similarUse[0]!.differences[0]).toMatch(/not interchangeable/)
  })
})
