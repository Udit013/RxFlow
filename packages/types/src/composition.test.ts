import { describe, it, expect } from 'vitest'
import {
  normalizeIngredientName, parseStrengthText, canonicalStrength, parseCompositionText, ingredientsFromGeneric,
  ingredientKey, compositionKey, formatComposition, mapDosageForm, releaseType, compareMedicines, regionalNames, atcLevel4, deriveIngredients,
} from './composition.js'

describe('normalizeIngredientName', () => {
  it('maps regional names to the INN', () => {
    expect(normalizeIngredientName('ACETAMINOPHEN')).toEqual({ name: 'paracetamol', salt: null })
    expect(normalizeIngredientName('Albuterol Sulfate')).toEqual({ name: 'salbutamol', salt: 'sulfate' })
    expect(normalizeIngredientName('Clavulanate Potassium')).toEqual({ name: 'clavulanic acid', salt: 'potassium' })
  })
  it('separates salts and hydrates from the moiety', () => {
    expect(normalizeIngredientName('AMLODIPINE BESYLATE')).toEqual({ name: 'amlodipine', salt: 'besylate' })
    expect(normalizeIngredientName('Amoxicillin Trihydrate')).toEqual({ name: 'amoxicillin', salt: 'trihydrate' })
    expect(normalizeIngredientName('Metformin Hydrochloride')).toEqual({ name: 'metformin', salt: 'hydrochloride' })
    expect(normalizeIngredientName('Diclofenac Sodium').name).toBe('diclofenac')
  })
  it('reads the Health Canada "MOIETY (SALT)" style', () => {
    expect(normalizeIngredientName('NORTRIPTYLINE (NORTRIPTYLINE HYDROCHLORIDE)')).toEqual({ name: 'nortriptyline', salt: 'hydrochloride' })
  })
  it('keeps esters and real salt-named substances intact', () => {
    expect(normalizeIngredientName('Fluticasone Propionate').name).toBe('fluticasone propionate')
    expect(normalizeIngredientName('Fluticasone Furoate').name).toBe('fluticasone furoate')
    expect(normalizeIngredientName('Sodium Chloride').name).toBe('sodium chloride')
    expect(normalizeIngredientName('Ferrous Sulfate').name).toBe('ferrous sulfate')
  })
  it('lists regional names for search expansion', () => {
    expect(regionalNames('paracetamol')).toContain('acetaminophen')
  })
})

describe('strengths', () => {
  it('parses openFDA strength strings', () => {
    expect(parseStrengthText('500 mg/1')).toEqual({ strength: 500, unit: 'mg' })
    expect(parseStrengthText('250 mg/5mL')).toEqual({ strength: 50, unit: 'mg/ml' })
    expect(parseStrengthText('10 mg/g')).toEqual({ strength: 1, unit: '%' })
    expect(parseStrengthText('90 ug/1')).toEqual({ strength: 90, unit: 'mcg' })
    expect(parseStrengthText('650mg')).toEqual({ strength: 650, unit: 'mg' })
  })
  it('canonicalises grams and per-dose amounts', () => {
    expect(canonicalStrength(1, 'G')).toEqual({ strength: 1000, unit: 'mg' })
    expect(canonicalStrength(100, 'MCG', 1, 'ACT')).toEqual({ strength: 100, unit: 'mcg' })
    expect(canonicalStrength(100, 'mcg', 1, 'actuation')).toEqual({ strength: 100, unit: 'mcg/dose' })
    expect(canonicalStrength(null, 'mg')).toEqual({ strength: null, unit: 'mg' })
  })
})

describe('parseCompositionText', () => {
  it('splits combinations with strengths', () => {
    expect(parseCompositionText('Paracetamol 500mg + Caffeine 65 mg')).toEqual([
      { name: 'paracetamol', salt: null, strength: 500, unit: 'mg' },
      { name: 'caffeine', salt: null, strength: 65, unit: 'mg' },
    ])
    const coAmox = parseCompositionText('Amoxicillin (500 mg) & Clavulanic acid (125mg)')
    expect(coAmox.map((i) => [i.name, i.strength])).toEqual([['amoxicillin', 500], ['clavulanic acid', 125]])
  })
  it('ignores pharmacopoeia and release suffixes', () => {
    expect(parseCompositionText('Pantoprazole 40mg IP, Domperidone 30mg SR').map((i) => i.name)).toEqual(['pantoprazole', 'domperidone'])
  })
  it('keeps unknown strengths as null', () => {
    expect(parseCompositionText('Pantoprazole + Domperidone')[1]).toEqual({ name: 'domperidone', salt: null, strength: null, unit: null })
  })
  it('builds from a generic name and strength label', () => {
    expect(ingredientsFromGeneric('Pantoprazole + Domperidone', '40mg+30mg').map((i) => i.strength)).toEqual([40, 30])
    expect(ingredientsFromGeneric('Metformin Hydrochloride', '500mg')[0]).toEqual({ name: 'metformin', salt: 'hydrochloride', strength: 500, unit: 'mg' })
  })
})

describe('keys', () => {
  const a = [{ name: 'clavulanic acid', strength: 125, unit: 'mg' }, { name: 'amoxicillin', strength: 500, unit: 'mg' }]
  it('is order independent', () => {
    expect(ingredientKey(a)).toBe('amoxicillin+clavulanic acid')
    expect(compositionKey(a)).toBe('amoxicillin@500mg+clavulanic acid@125mg')
    expect(compositionKey([...a].reverse())).toBe(compositionKey(a))
  })
  it('has no composition key when a strength is unknown', () => {
    expect(compositionKey([{ name: 'x', strength: null, unit: null }])).toBeNull()
    expect(ingredientKey([])).toBeNull()
  })
  it('formats for display', () => {
    expect(formatComposition(a)).toBe('Clavulanic Acid 125 mg + Amoxicillin 500 mg')
  })
})

describe('dosage forms', () => {
  it('maps regulator wording', () => {
    expect(mapDosageForm('TABLET, FILM COATED')).toBe('TABLET')
    expect(mapDosageForm('METERED-DOSE AEROSOL')).toBe('INHALER')
    expect(mapDosageForm('INJECTION, SOLUTION')).toBe('INJECTION')
    expect(mapDosageForm('SOLUTION/ DROPS')).toBe('DROPS')
    expect(mapDosageForm('CAPSULE (DELAYED RELEASE)')).toBe('CAPSULE')
  })
  it('uses the route so a bare "solution" is never shown as a syrup', () => {
    expect(mapDosageForm('SOLUTION', 'RESPIRATORY (INHALATION)')).toBe('SOLUTION')
    expect(mapDosageForm('SOLUTION', 'INTRAVENOUS')).toBe('INJECTION')
    expect(mapDosageForm('SOLUTION', 'OPHTHALMIC')).toBe('DROPS')
    expect(mapDosageForm('SOLUTION', 'TOPICAL')).toBe('SOLUTION')
    expect(mapDosageForm('SOLUTION', 'ORAL')).toBe('SOLUTION')
    expect(mapDosageForm('SYRUP', 'ORAL')).toBe('SYRUP')
    expect(mapDosageForm('POWDER', 'INHALATION')).toBe('INHALER') // Diskus
    expect(mapDosageForm('CAPSULE', 'INHALATION')).toBe('INHALER') // Rotacaps
    expect(mapDosageForm('CAPSULE', 'ORAL')).toBe('CAPSULE')
  })
  it('detects release mechanisms', () => {
    expect(releaseType('TABLET, EXTENDED RELEASE')).toBe('MODIFIED')
    expect(releaseType(null, 'Glycomet SR 500')).toBe('MODIFIED')
    expect(releaseType('TABLET (ENTERIC-COATED)')).toBe('DELAYED')
    expect(releaseType('TABLET')).toBe('IMMEDIATE')
  })
})

describe('compareMedicines', () => {
  const para500 = { ingredients: [{ name: 'paracetamol', strength: 500, unit: 'mg' }], dosageForm: 'TABLET', atcCode: 'N02BE01' }
  it('same composition requires same moieties, strength and form', () => {
    expect(compareMedicines(para500, { ...para500 }).relation).toBe('SAME_COMPOSITION')
  })
  it('different strength or form is a variant, with the differences spelled out', () => {
    const r = compareMedicines(para500, { ...para500, ingredients: [{ name: 'paracetamol', strength: 650, unit: 'mg' }] })
    expect(r.relation).toBe('VARIANT')
    expect(r.differences).toContain('Different strength')
    expect(compareMedicines(para500, { ...para500, dosageForm: 'SYRUP' }).differences).toContain('Different dosage form')
  })
  it('flags release mechanism and salt differences', () => {
    const er = compareMedicines(para500, { ...para500, dosageFormDetail: 'TABLET, EXTENDED RELEASE' })
    expect(er.relation).toBe('VARIANT') // never grouped as the same composition
    expect(er.differences.join()).toMatch(/release/)
    const d1 = { ingredients: [{ name: 'diclofenac', salt: 'sodium', strength: 50, unit: 'mg' }], dosageForm: 'TABLET' }
    const d2 = { ingredients: [{ name: 'diclofenac', salt: 'potassium', strength: 50, unit: 'mg' }], dosageForm: 'TABLET' }
    expect(compareMedicines(d1, d2).differences).toContain('Different salt of the same active ingredient')
  })
  it('a different route is a variant even with the same form name', () => {
    const vaginal = { ingredients: [{ name: 'clotrimazole', strength: 100, unit: 'mg' }], dosageForm: 'TABLET', route: 'VAGINAL' }
    const r = compareMedicines(vaginal, { ...vaginal, route: 'ORAL' })
    expect(r.relation).toBe('VARIANT')
    expect(r.differences).toContain('Different route of administration')
    expect(compareMedicines(vaginal, { ...vaginal, route: null }).relation).toBe('SAME_COMPOSITION') // unknown route: no claim
  })
  it('products sharing only some ingredients are combinations, with what differs spelled out', () => {
    const r = compareMedicines(para500, { ingredients: [{ name: 'paracetamol', strength: 500, unit: 'mg' }, { name: 'caffeine', strength: 65, unit: 'mg' }], dosageForm: 'TABLET', atcCode: 'N02BE51' })
    expect(r.relation).toBe('COMBINATION')
    expect(r.differences).toEqual(['Also contains Caffeine', 'Different combination — not interchangeable'])
  })
  it('same ATC group with different ingredients is similar use and never a substitute', () => {
    const r = compareMedicines(
      { ingredients: [{ name: 'atorvastatin', strength: 10, unit: 'mg' }], dosageForm: 'TABLET', atcCode: 'C10AA05' },
      { ingredients: [{ name: 'rosuvastatin', strength: 10, unit: 'mg' }], dosageForm: 'TABLET', atcCode: 'C10AA07' },
    )
    expect(r.relation).toBe('SIMILAR_USE')
    expect(r.differences[0]).toMatch(/not interchangeable/)
  })
  it('reads the ATC level-4 group', () => {
    expect(atcLevel4('J01CA04')).toBe('J01CA')
    expect(atcLevel4('J01')).toBeNull()
  })
})

describe('deriveIngredients', () => {
  it('prefers the composition text', () => {
    expect(deriveIngredients({ name: 'Pan-D 40', genericName: 'Pantoprazole + Domperidone', strength: '40mg', composition: 'Pantoprazole 40mg + Domperidone 30mg' })
      .map((i) => [i.name, i.strength])).toEqual([['pantoprazole', 40], ['domperidone', 30]])
  })
  it('falls back to generic name and strength', () => {
    expect(deriveIngredients({ name: 'Dolo 650', genericName: 'Paracetamol', strength: '650mg' })).toEqual([{ name: 'paracetamol', salt: null, strength: 650, unit: 'mg' }])
  })
  it('ignores a generic name that merely repeats the product name', () => {
    expect(deriveIngredients({ name: 'Dolo 650', genericName: 'Dolo 650', strength: '650mg' })).toEqual([])
  })
})
