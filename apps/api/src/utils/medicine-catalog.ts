/**
 * Catalog search, structured compositions and alternatives for the medicine routes.
 * Composition maths lives in @rxflow/types (composition.ts) so the importer and web share it.
 */
import type { Prisma } from '@rxflow/db'
import {
  canonicalStrength, compareMedicines, deriveIngredients, normalizeIngredientName, regionalNames,
  ingredientKey, compositionKey, formatComposition, formatStrength, type Ingredient, type Relation,
} from '@rxflow/types'

// ── Search ───────────────────────────────────────────────────────────────────

const FORM_WORDS: Record<string, string> = {
  tab: 'TABLET', tabs: 'TABLET', tablet: 'TABLET', tablets: 'TABLET',
  cap: 'CAPSULE', caps: 'CAPSULE', capsule: 'CAPSULE', capsules: 'CAPSULE',
  syrup: 'SYRUP', solution: 'SOLUTION', inj: 'INJECTION', injection: 'INJECTION',
  cream: 'CREAM', ointment: 'OINTMENT', drops: 'DROPS', drop: 'DROPS', inhaler: 'INHALER',
  patch: 'PATCH', suppository: 'SUPPOSITORY', powder: 'POWDER', suspension: 'SUSPENSION',
  gel: 'GEL', lotion: 'LOTION', spray: 'SPRAY',
}

/** Everyday therapeutic terms → ATC prefixes, so "antibiotic" or "blood pressure" finds products. */
const THERAPEUTIC_TERMS: Record<string, string[]> = {
  antibiotic: ['J01'], antibiotics: ['J01'], antibacterial: ['J01'], antifungal: ['J02', 'D01'], antiviral: ['J05'],
  analgesic: ['N02'], painkiller: ['N02', 'M01A'], pain: ['N02', 'M01A'], nsaid: ['M01A'], fever: ['N02BE', 'N02BA'],
  diabetes: ['A10'], antidiabetic: ['A10'], statin: ['C10AA'], cholesterol: ['C10'],
  hypertension: ['C02', 'C03', 'C07', 'C08', 'C09'], antihypertensive: ['C02', 'C03', 'C07', 'C08', 'C09'],
  acidity: ['A02'], antacid: ['A02'], ppi: ['A02BC'], ulcer: ['A02B'], allergy: ['R06'], antihistamine: ['R06'],
  asthma: ['R03'], antidepressant: ['N06A'], depression: ['N06A'], anxiety: ['N05B'], antipsychotic: ['N05A'],
  epilepsy: ['N03'], antiepileptic: ['N03'], seizure: ['N03'], thyroid: ['H03'], steroid: ['H02', 'D07'],
  corticosteroid: ['H02', 'D07', 'R03BA'], gout: ['M04'], vitamin: ['A11', 'B03BA'], diuretic: ['C03'],
  anticoagulant: ['B01A'], antiplatelet: ['B01AC'], nausea: ['A03F', 'A04'], antiemetic: ['A04'], diarrhoea: ['A07'],
  diarrhea: ['A07'], worms: ['P02'], anthelmintic: ['P02'], glaucoma: ['S01E'], sleep: ['N05C'], insomnia: ['N05C'],
}
const PHRASES: Record<string, string[]> = { 'blood pressure': THERAPEUTIC_TERMS.hypertension!, 'blood thinner': ['B01A'] }

const STRENGTH_RE = /(\d+(?:\.\d+)?)\s*(mg|mcg|µg|ug|gm|g|iu|%)(?:\s*\/\s*(\d+(?:\.\d+)?)?\s*ml)?(?![a-z])/gi

/**
 * Free-text catalog search. Every term must match (AND); each term may hit the brand, generic,
 * product or manufacturer name, an active ingredient (regional names included), the
 * therapeutic class or category, or an alias. Strengths ("500mg", "250mg/5ml") match the
 * structured composition; form words ("tab", "syrup") match the dosage form.
 */
export function buildSearchWhere(raw: string): Prisma.MedicineWhereInput | null {
  let rest = ` ${raw.trim().toLowerCase()} `
  if (!rest.trim()) return null
  const and: Prisma.MedicineWhereInput[] = []

  for (const [phrase, prefixes] of Object.entries(PHRASES)) {
    if (rest.includes(` ${phrase} `)) {
      and.push({ OR: prefixes.map((p) => ({ atcCode: { startsWith: p } })) })
      rest = rest.replace(` ${phrase} `, ' ')
    }
  }

  for (const m of [...rest.matchAll(STRENGTH_RE)]) {
    const perMl = m[0].includes('/')
    const s = canonicalStrength(Number(m[1]), m[2], perMl ? Number(m[3] || 1) : null, perMl ? 'ml' : null)
    and.push({
      OR: [
        { compositions: { some: { strengthNum: s.strength, unit: s.unit ?? '' } } },
        { strength: { contains: m[0].replace(/\s+/g, ''), mode: 'insensitive' } },
        { strength: { contains: m[0], mode: 'insensitive' } },
        { name: { contains: m[0].replace(/\s+/g, ''), mode: 'insensitive' } },
      ],
    })
    rest = rest.replace(m[0], ' ')
  }

  for (const word of rest.split(/\s+/).filter((w) => w.length >= 2 || /\d/.test(w))) {
    const form = FORM_WORDS[word]
    if (form) {
      and.push({ OR: [{ dosageForm: form as Prisma.MedicineWhereInput['dosageForm'] }, { name: { contains: word, mode: 'insensitive' } }] })
      continue
    }
    if (/^\d+(\.\d+)?$/.test(word)) {
      const n = Number(word)
      and.push({
        OR: [
          { name: { contains: word, mode: 'insensitive' } },
          { strength: { contains: word } },
          { strengthNumeric: n },
          { compositions: { some: { strengthNum: n } } },
        ],
      })
      continue
    }
    const inn = normalizeIngredientName(word).name
    const names = [...new Set([word, inn, ...regionalNames(inn)])]
    const or: Prisma.MedicineWhereInput[] = []
    for (const n of names) {
      or.push(
        { name: { contains: n, mode: 'insensitive' } },
        { brandName: { contains: n, mode: 'insensitive' } },
        { genericName: { contains: n, mode: 'insensitive' } },
        { manufacturerName: { contains: n, mode: 'insensitive' } },
        { composition: { contains: n, mode: 'insensitive' } },
        { therapeuticClass: { contains: n, mode: 'insensitive' } },
        { category: { contains: n, mode: 'insensitive' } },
        { compositions: { some: { ingredient: { contains: n.toLowerCase() } } } },
      )
    }
    or.push({ aliases: { has: raw.trim() } }, { aliases: { has: word } })
    if (/^[a-z]\d{2}[a-z]{0,2}\d{0,2}$/i.test(word)) or.push({ atcCode: { startsWith: word.toUpperCase() } })
    for (const p of THERAPEUTIC_TERMS[word] ?? []) or.push({ atcCode: { startsWith: p } })
    and.push({ OR: or })
  }
  return and.length ? { AND: and } : null
}

// ── Structured compositions on create / update ───────────────────────────────

export interface IngredientInput {
  name: string
  strength?: number | null
  unit?: string | null
  salt?: string | null
}

/** Normalise ingredients typed into the form ("Acetaminophen", 500, "mg") to the stored shape. */
export function normalizeInputIngredients(input: IngredientInput[]): Ingredient[] {
  return input
    .filter((i) => i.name && i.name.trim())
    .map((i) => {
      const { name, salt } = normalizeIngredientName(i.name)
      return { name, salt: i.salt?.trim().toLowerCase() || salt, ...canonicalStrength(i.strength ?? null, i.unit ?? null) }
    })
}

export function compositionFields(ingredients: Ingredient[]) {
  return {
    ingredientKey: ingredientKey(ingredients),
    compositionKey: compositionKey(ingredients),
  }
}

/**
 * Ingredients for a create: what the user entered, else parsed from the composition text or
 * generic name + strength. Returns [] when nothing reliable can be derived.
 */
export function ingredientsForCreate(body: {
  ingredients?: IngredientInput[]
  name: string
  genericName?: string
  strength?: string
  composition?: string
}): Ingredient[] {
  if (body.ingredients?.length) return normalizeInputIngredients(body.ingredients)
  return deriveIngredients(body)
}

export function compositionRows(medicineId: string, ingredients: Ingredient[]) {
  return ingredients.map((i) => ({
    medicineId,
    ingredient: i.name,
    salt: i.salt ?? null,
    strength: formatStrength(i.strength, i.unit),
    strengthNum: i.strength,
    unit: i.unit ?? '',
  }))
}

/** Fill the free-text columns from structured ingredients when the user left them blank. */
export function textDefaults(ingredients: Ingredient[], body: { composition?: string; strength?: string }) {
  if (!ingredients.length) return {}
  const first = ingredients[0]!
  return {
    ...(body.composition ? {} : { composition: formatComposition(ingredients) }),
    ...(body.strength || first.strength === null ? {} : {
      strength: ingredients.map((i) => formatStrength(i.strength, i.unit)).join(' + '),
      strengthNumeric: first.strength,
      strengthUnit: first.unit,
    }),
  }
}

// ── Alternatives ─────────────────────────────────────────────────────────────

export interface CatalogRow {
  id: string
  name: string
  brandName: string
  genericName: string
  manufacturerName: string
  dosageForm: string
  dosageFormDetail: string | null
  route: string | null
  strength: string
  packSize: string
  mrp: number
  country: string | null
  ownerTenantId: string | null
  dataSource: string | null
  sourceUrl: string | null
  isVerified: boolean
  atcCode: string | null
  therapeuticClass: string | null
  compositions: { ingredient: string; salt: string | null; strengthNum: number | null; unit: string }[]
}

export function rowIngredients(row: Pick<CatalogRow, 'compositions'> & { name?: string; genericName?: string; strength?: string; composition?: string | null }): Ingredient[] {
  if (row.compositions.length) {
    return row.compositions.map((c) => ({ name: c.ingredient, salt: c.salt, strength: c.strengthNum, unit: c.unit || null }))
  }
  return deriveIngredients(row)
}

export interface Alternative extends Omit<CatalogRow, 'compositions'> {
  relation: Relation
  differences: string[]
  ingredients: Ingredient[]
  composition: string
  inYourMarket: boolean
  inStock: number
}

/**
 * Group candidate products by how they relate to `base`. Nothing here asserts interchangeability:
 * same-composition products can still differ in salt, release or excipients, and similar-use
 * products have different active ingredients.
 */
export function groupAlternatives(
  base: CatalogRow,
  candidates: CatalogRow[],
  ctx: { tenantId: string; country: string; stock: Map<string, number> },
) {
  const baseIng = rowIngredients(base)
  const groups: Record<'sameComposition' | 'variants' | 'combinations' | 'similarUse', Alternative[]> = { sameComposition: [], variants: [], combinations: [], similarUse: [] }
  const seen = new Set<string>()
  for (const c of candidates) {
    if (c.id === base.id || seen.has(c.id)) continue
    seen.add(c.id)
    const ingredients = rowIngredients(c)
    const cmp = compareMedicines(
      { ingredients: baseIng, dosageForm: base.dosageForm, dosageFormDetail: base.dosageFormDetail, route: base.route, name: base.name, atcCode: base.atcCode },
      { ingredients, dosageForm: c.dosageForm, dosageFormDetail: c.dosageFormDetail, route: c.route, name: c.name, atcCode: c.atcCode },
    )
    const { compositions: _c, ...rest } = c
    const item: Alternative = {
      ...rest,
      relation: cmp.relation,
      differences: cmp.differences,
      ingredients,
      composition: formatComposition(ingredients),
      inYourMarket: c.ownerTenantId === ctx.tenantId || c.country === ctx.country || c.country === null,
      inStock: ctx.stock.get(c.id) ?? 0,
    }
    if (cmp.relation === 'SAME_COMPOSITION') groups.sameComposition.push(item)
    else if (cmp.relation === 'VARIANT') groups.variants.push(item)
    else if (cmp.relation === 'COMBINATION') groups.combinations.push(item)
    else if (cmp.relation === 'SIMILAR_USE') groups.similarUse.push(item)
  }
  const order = (a: Alternative, b: Alternative) =>
    Number(b.inYourMarket) - Number(a.inYourMarket) || b.inStock - a.inStock || Number(b.isVerified) - Number(a.isVerified) || a.name.localeCompare(b.name)
  for (const g of Object.values(groups)) g.sort(order)
  return { baseIngredients: baseIng, ...groups }
}
