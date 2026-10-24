/**
 * Active-ingredient normalisation, shared by the API, the catalog importer and the web form.
 *
 * Two products are grouped as "same composition" only when their normalised active moieties AND
 * labelled strengths match and the dosage form is the same. That is a lookup aid for a
 * pharmacist — never a claim that the products are interchangeable: salt, release mechanism,
 * excipients and bioequivalence can still differ, and substitution rules are set by local law.
 */

export interface Ingredient {
  /** Active moiety in lower case INN form, e.g. "paracetamol", "amlodipine". */
  name: string
  /** Salt / hydrate the label names, e.g. "besylate", "trihydrate". Kept for comparison. */
  salt?: string | null
  /** Labelled amount per unit, e.g. 500 (mg per tablet) or 50 (mg per mL). */
  strength: number | null
  /** Canonical unit: mg | mcg | iu | unit | % | mg/ml | mcg/dose … */
  unit: string | null
}

// ── Names ────────────────────────────────────────────────────────────────────

/**
 * Regional names → WHO INN. US (USAN) and older British (BAN) names differ from the INN for a
 * handful of common drugs; without this, "acetaminophen" and "paracetamol" never meet.
 */
export const INN_SYNONYMS: Record<string, string> = {
  acetaminophen: 'paracetamol',
  albuterol: 'salbutamol',
  levalbuterol: 'levosalbutamol',
  epinephrine: 'adrenaline',
  norepinephrine: 'noradrenaline',
  glyburide: 'glibenclamide',
  meperidine: 'pethidine',
  amoxycillin: 'amoxicillin',
  cephalexin: 'cefalexin',
  cephradine: 'cefradine',
  cephazolin: 'cefazolin',
  frusemide: 'furosemide',
  lignocaine: 'lidocaine',
  clavulanate: 'clavulanic acid',
  valproate: 'valproic acid',
  divalproex: 'valproic acid',
  rifampin: 'rifampicin',
  methylergonovine: 'methylergometrine',
  'paracetamol acetaminophen': 'paracetamol',
  acyclovir: 'aciclovir',
  valacyclovir: 'valaciclovir',
  chlorthalidone: 'chlortalidone',
  'vitamin d': 'colecalciferol',
  cyclosporine: 'ciclosporin',
  cyclosporin: 'ciclosporin',
  cholecalciferol: 'colecalciferol',
  'vitamin d3': 'colecalciferol',
  'vitamin b12': 'cyanocobalamin',
  phenobarbitone: 'phenobarbital',
  thyroxine: 'levothyroxine',
  mesalamine: 'mesalazine',
  nitroglycerin: 'glyceryl trinitrate',
  aspirin: 'acetylsalicylic acid',
  'acetylsalicylic acid': 'acetylsalicylic acid',
  beclomethasone: 'beclometasone',
  cromolyn: 'cromoglicic acid',
  'sodium cromoglycate': 'cromoglicic acid',
  chlorpheniramine: 'chlorphenamine',
  eformoterol: 'formoterol',
  torsemide: 'torasemide',
  guaiphenesin: 'guaifenesin',
  dicyclomine: 'dicycloverine',
  isoproterenol: 'isoprenaline',
  sulphamethoxazole: 'sulfamethoxazole',
  sulphasalazine: 'sulfasalazine',
  oestradiol: 'estradiol',
}

/** Reverse lookup for search: "paracetamol" → ["acetaminophen"]. */
export function regionalNames(inn: string): string[] {
  const key = inn.trim().toLowerCase()
  return Object.entries(INN_SYNONYMS).filter(([k, v]) => v === key && k !== key).map(([k]) => k)
}

/**
 * Salt and hydrate words around the active moiety ("amlodipine besylate"). Esters such as
 * propionate, furoate, valerate and acetonide are NOT here: fluticasone propionate and
 * fluticasone furoate are different medicines, so they stay part of the name.
 */
const SALT_WORDS = new Set([
  'hydrochloride', 'hcl', 'dihydrochloride', 'hydrobromide', 'sulfate', 'sulphate', 'bisulfate',
  'sodium', 'potassium', 'calcium', 'magnesium', 'besylate', 'besilate', 'maleate', 'mesylate',
  'mesilate', 'tartrate', 'bitartrate', 'citrate', 'fumarate', 'hemifumarate', 'succinate',
  'phosphate', 'diphosphate', 'acetate', 'lactate', 'gluconate', 'bromide', 'nitrate',
  'monohydrate', 'dihydrate', 'trihydrate', 'hemihydrate', 'sesquihydrate', 'anhydrous',
  'hyclate', 'disodium', 'trometamol', 'tromethamine', 'arginine', 'lysine', 'olamine',
  'dipotassium', 'monosodium', 'pamoate', 'embonate', 'tosylate', 'xinafoate', 'erbumine',
  // Prodrug esters sold only in that form (olmesartan medoxomil, cefuroxime axetil): grouped with the moiety.
  'medoxomil', 'kamedoxomil', 'cilexetil', 'axetil', 'proxetil', 'pivoxil', 'benzoate', 'pidolate', 'propanediol',
])

/** Whole names that would otherwise lose their real moiety ("sodium chloride" → "chloride"). */
const KEEP_WHOLE = new Set([
  'sodium chloride', 'potassium chloride', 'calcium carbonate', 'magnesium hydroxide', 'zinc sulfate',
  'ferrous sulfate', 'calcium gluconate', 'sodium bicarbonate', 'magnesium sulfate', 'ferrous fumarate',
  'calcium citrate', 'potassium citrate', 'sodium fluoride', 'magnesium oxide', 'calcium acetate',
])

function squash(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9%.\s-]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Normalise one ingredient label to { moiety, salt }.
 *   "AMLODIPINE BESYLATE"                          → amlodipine / besylate
 *   "NORTRIPTYLINE (NORTRIPTYLINE HYDROCHLORIDE)"  → nortriptyline / hydrochloride  (Health Canada style)
 *   "Acetaminophen"                                → paracetamol
 */
export function normalizeIngredientName(raw: string): { name: string; salt: string | null } {
  let text = raw.trim()
  let saltFromParen: string | null = null
  const paren = text.match(/^(.*?)\s*\((.*)\)\s*$/)
  if (paren && paren[1]) {
    text = paren[1]
    const saltParts = squash(paren[2] ?? '').split(' ').filter((w) => SALT_WORDS.has(w))
    if (saltParts.length) saltFromParen = saltParts.join(' ')
  }
  let name = squash(text)
  if (INN_SYNONYMS[name]) return { name: INN_SYNONYMS[name]!, salt: saltFromParen }
  if (KEEP_WHOLE.has(name)) return { name, salt: saltFromParen }

  const words = name.split(' ')
  const salt: string[] = []
  while (words.length > 1 && SALT_WORDS.has(words[words.length - 1]!)) salt.unshift(words.pop()!)
  while (words.length > 1 && SALT_WORDS.has(words[0]!)) salt.push(words.shift()!)
  name = words.join(' ')
  name = INN_SYNONYMS[name] ?? name
  return { name, salt: saltFromParen ?? (salt.length ? salt.join(' ') : null) }
}

/** "clavulanic acid" → "Clavulanic Acid". */
export function displayIngredient(name: string): string {
  return name.replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

// ── Strengths ────────────────────────────────────────────────────────────────

const UNIT_ALIASES: Record<string, string> = {
  mg: 'mg', milligram: 'mg', milligrams: 'mg',
  mcg: 'mcg', µg: 'mcg', ug: 'mcg', microgram: 'mcg', micrograms: 'mcg',
  g: 'g', gm: 'g', gram: 'g', grams: 'g',
  ml: 'ml', l: 'l',
  iu: 'iu', 'i.u.': 'iu', '[iu]': 'iu', unit: 'unit', units: 'unit', u: 'unit', "[usp'u]": 'unit',
  '%': '%', 'w/w': '%', 'w/v': '%', 'v/v': '%',
  meq: 'meq', mmol: 'mmol',
}

function unitOf(raw: string | null | undefined): string | null {
  if (!raw) return null
  const u = raw.trim().toLowerCase().replace(/\s+/g, '')
  return UNIT_ALIASES[u] ?? (u || null)
}

function round(n: number): number {
  return Number(n.toPrecision(6))
}

/**
 * Canonical strength from an amount, its unit and an optional "per" quantity:
 *   (500, 'MG')                  → 500 mg
 *   (1, 'G')                     → 1000 mg
 *   (250, 'mg', 5, 'mL')         → 50 mg/ml
 *   (10, 'mg', 1, 'g')           → 1 %
 *   (100, 'mcg', 1, 'actuation') → 100 mcg/dose
 */
export function canonicalStrength(
  amount: number | null | undefined,
  unitRaw: string | null | undefined,
  perAmount?: number | null,
  perUnitRaw?: string | null,
): { strength: number | null; unit: string | null } {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return { strength: null, unit: unitOf(unitRaw) }
  let value = amount
  let unit = unitOf(unitRaw)
  if (unit === 'g') { value *= 1000; unit = 'mg' }

  const perUnit = unitOf(perUnitRaw)
  const per = perAmount && perAmount > 0 ? perAmount : 1
  if (perUnit === 'ml' || perUnit === 'l') {
    const ml = perUnit === 'l' ? per * 1000 : per
    return { strength: round(value / ml), unit: `${unit}/ml` }
  }
  if ((perUnit === 'g' || perUnit === 'mg') && (unit === 'mg' || unit === 'mcg')) {
    const perMg = perUnit === 'g' ? per * 1000 : per
    const mg = unit === 'mcg' ? value / 1000 : value
    return { strength: round((mg / perMg) * 100), unit: '%' }
  }
  if (perUnit === 'g' || perUnit === 'mg') {
    // Non-mass amount per mass (IU per gram): keep the denominator rather than drop it.
    const perG = perUnit === 'mg' ? per / 1000 : per
    return { strength: round(value / perG), unit: `${unit}/g` }
  }
  if (perUnit && /^(actuation|dose|puff|spray|inhalation|blister|metered)/.test(perUnit)) {
    return { strength: round(value / per), unit: `${unit}/dose` }
  }
  return { strength: round(value), unit }
}

/** "500 mg/1", "250 mg/5mL", "10 mg/g", "5%", "650mg" → canonical strength. */
export function parseStrengthText(text: string | null | undefined): { strength: number | null; unit: string | null } {
  if (!text) return { strength: null, unit: null }
  const m = text.trim().match(/^([\d.,]+)\s*([^\s/\d][^/]*?)?\s*(?:\/\s*([\d.]*)\s*([^\s\d]\S*)?)?\s*$/i)
  if (!m) return { strength: null, unit: null }
  const amount = Number(m[1]!.replace(/,/g, ''))
  const per = m[3] ? Number(m[3]) : null
  return canonicalStrength(amount, m[2] ?? null, per, m[4] ?? null)
}

/** Human-readable strength: 500 mg, 50 mg/mL, 1%. */
export function formatStrength(strength: number | null | undefined, unit: string | null | undefined): string {
  if (strength === null || strength === undefined) return '—'
  const u = (unit ?? '').replace('/ml', '/mL').replace(/^ml$/, 'mL').replace(/^iu/, 'IU')
  return u === '%' ? `${strength}%` : `${strength} ${u}`.trim()
}

// ── Free-text compositions ───────────────────────────────────────────────────

const AMOUNT_RE = /(\d+(?:[.,]\d+)?)\s*(mg|mcg|µg|ug|gm|g|ml|iu|i\.u\.|units?|%|meq|mmol)(?![a-z])(?:\s*\/\s*(\d+(?:\.\d+)?)?\s*(ml|gm|g|dose|actuation|puff|spray)\b)?/i

const FORM_NOISE = /\b(ip|bp|usp|sr|er|xr|cr|ds|forte|tablets?|capsules?|tab|cap|syrup|suspension|injection|cream|ointment|gel|drops?|each|contains|film[- ]coated)\b\.?/gi

/**
 * "Paracetamol 500mg + Caffeine 65 mg", "Amoxicillin (500 mg) & Clavulanic acid (125mg)",
 * "Pantoprazole 40mg, Domperidone 30mg SR" → structured ingredients. Unknown strengths stay null.
 */
export function parseCompositionText(text: string | null | undefined): Ingredient[] {
  if (!text || !text.trim()) return []
  const parts = text.split(/\s*(?:\+|,|;|&|\band\b|\bwith\b)\s*/i).map((p) => p.trim()).filter(Boolean)
  const out: Ingredient[] = []
  for (const part of parts) {
    const m = part.match(AMOUNT_RE)
    const namePart = (m ? part.slice(0, m.index) + ' ' + part.slice((m.index ?? 0) + m[0].length) : part)
      .replace(/[()[\]]/g, ' ')
      .replace(FORM_NOISE, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!namePart || /^\d/.test(namePart)) continue
    const { name, salt } = normalizeIngredientName(namePart)
    if (!name) continue
    const s = m
      ? canonicalStrength(Number(m[1]!.replace(',', '.')), m[2], m[3] ? Number(m[3]) : null, m[4] ?? null)
      : { strength: null, unit: null }
    out.push({ name, salt, strength: s.strength, unit: s.unit })
  }
  return out
}

/** Generic name + strength label ("Pantoprazole + Domperidone", "40mg+30mg") → ingredients. */
export function ingredientsFromGeneric(genericName: string, strength?: string | null): Ingredient[] {
  const names = genericName.split(/\s*(?:\+|,|&|\band\b)\s*/i).map((s) => s.trim()).filter(Boolean)
  const amounts = (strength ?? '').split(/\s*(?:\+|,)\s*/).map((s) => s.trim()).filter((s) => /\d/.test(s))
  return names.map((n, i) => {
    const { name, salt } = normalizeIngredientName(n)
    const s = amounts[i] ? parseStrengthText(amounts[i]) : { strength: null, unit: null }
    return { name, salt, strength: s.strength, unit: s.unit }
  })
}

// ── Keys ─────────────────────────────────────────────────────────────────────

/** Ingredient set only: "amoxicillin+clavulanic acid". Null when there are no ingredients. */
export function ingredientKey(ingredients: Pick<Ingredient, 'name'>[]): string | null {
  const names = [...new Set(ingredients.map((i) => i.name.trim().toLowerCase()).filter(Boolean))].sort()
  return names.length ? names.join('+') : null
}

/** Ingredient set with strengths: "amoxicillin@500mg+clavulanic acid@125mg". Null if any strength is unknown. */
export function compositionKey(ingredients: Ingredient[]): string | null {
  if (!ingredients.length || ingredients.some((i) => i.strength === null || !i.unit)) return null
  return [...ingredients]
    .map((i) => `${i.name.trim().toLowerCase()}@${i.strength}${i.unit}`)
    .sort()
    .join('+')
}

/** Display string: "Amoxicillin 500 mg + Clavulanic Acid 125 mg". */
export function formatComposition(ingredients: Ingredient[]): string {
  return ingredients
    .map((i) => `${displayIngredient(i.name)}${i.strength !== null ? ` ${formatStrength(i.strength, i.unit)}` : ''}`)
    .join(' + ')
}

// ── Dosage forms ─────────────────────────────────────────────────────────────

export type DosageFormCode =
  | 'TABLET' | 'CAPSULE' | 'SYRUP' | 'SOLUTION' | 'INJECTION' | 'CREAM' | 'OINTMENT' | 'DROPS' | 'INHALER'
  | 'PATCH' | 'SUPPOSITORY' | 'POWDER' | 'SUSPENSION' | 'GEL' | 'LOTION' | 'SPRAY' | 'OTHER'

const PARENTERAL_ROUTE = /intravenous|intramuscular|subcutaneous|intradermal|intravitreal|intrathecal|epidural|intra-?articular|intralesional|parenteral|infiltration/

/**
 * Map a regulator's dosage-form text ("TABLET, FILM COATED", "METERED-DOSE AEROSOL") and route
 * onto the app's forms. The route matters: a bare "SOLUTION" may be oral, injectable, topical or
 * for a nebuliser, and must never be shown as a syrup unless the label says syrup.
 */
export function mapDosageForm(raw: string | null | undefined, route?: string | null): DosageFormCode {
  const s = (raw ?? '').toLowerCase()
  const r = (route ?? '').toLowerCase()
  if (!s) return 'OTHER'
  if (/inject|infusion/.test(s) || (PARENTERAL_ROUTE.test(r) && !/oral|topical/.test(r))) return 'INJECTION'
  if (/aerosol|metered|inhaler|inhalant|inhalation powder/.test(s)) return 'INHALER'
  if (/(solution|suspension|liquid)/.test(s) && /ophthalmic|otic|auricular/.test(r)) return 'DROPS'
  if (/(solution|suspension)/.test(s) && /inhal|respiratory/.test(r)) return 'SOLUTION' // nebuliser
  // Dry-powder and capsule inhalers (Diskus, Rotacaps) are inhaled, never swallowed.
  if (/inhal|respiratory/.test(r)) return 'INHALER'
  if (/patch|transdermal/.test(s)) return 'PATCH'
  if (/suppositor/.test(s)) return 'SUPPOSITORY'
  if (/drop|ophthalmic|otic/.test(s)) return 'DROPS'
  if (/spray/.test(s)) return 'SPRAY'
  if (/ointment/.test(s)) return 'OINTMENT'
  if (/cream/.test(s)) return 'CREAM'
  if (/\bgel\b|jelly/.test(s)) return 'GEL'
  if (/lotion/.test(s)) return 'LOTION'
  if (/capsule/.test(s)) return 'CAPSULE'
  if (/tablet|caplet|lozenge|troche/.test(s)) return 'TABLET'
  if (/syrup|elixir/.test(s)) return 'SYRUP'
  if (/suspension/.test(s)) return 'SUSPENSION'
  if (/powder|granule|sachet/.test(s)) return 'POWDER'
  if (/solution|liquid|concentrate|tincture/.test(s)) return 'SOLUTION'
  return 'OTHER'
}

export type ReleaseType = 'IMMEDIATE' | 'MODIFIED' | 'DELAYED'

/** Release mechanism from form text or a product name: ER/SR/XR/CR → MODIFIED, DR/EC → DELAYED. */
export function releaseType(...texts: (string | null | undefined)[]): ReleaseType {
  const s = texts.filter(Boolean).join(' ').toLowerCase()
  if (/(extended|sustained|controlled|prolonged|modified)[-\s(]*release|\b(er|sr|xr|xl|cr|la|mr)\b/.test(s)) return 'MODIFIED'
  if (/delayed[-\s(]*release|enteric|gastro[-\s]?resistant|\b(dr|ec)\b/.test(s)) return 'DELAYED'
  return 'IMMEDIATE'
}

// ── Comparison ───────────────────────────────────────────────────────────────

export type Relation = 'SAME_COMPOSITION' | 'VARIANT' | 'COMBINATION' | 'SIMILAR_USE' | 'UNRELATED'

export interface ComparableMedicine {
  ingredients: Ingredient[]
  dosageForm: string
  dosageFormDetail?: string | null
  route?: string | null
  name?: string | null
  atcCode?: string | null
}

export interface Comparison {
  relation: Relation
  /** Plain-language differences a pharmacist should check, e.g. "Different release mechanism". */
  differences: string[]
}

/** ATC level-4 (chemical/therapeutic subgroup), e.g. "J01CA04" → "J01CA". */
export function atcLevel4(code: string | null | undefined): string | null {
  return code && code.trim().length >= 5 ? code.trim().slice(0, 5).toUpperCase() : null
}

/**
 * How `other` relates to `base`:
 *  - SAME_COMPOSITION: same active moieties, same labelled strengths, same dosage form and release
 *  - VARIANT:          same active moieties, different strength, form, release mechanism or route
 *  - COMBINATION:      shares some active moieties but adds or lacks others
 *  - SIMILAR_USE:      no shared active moiety, same ATC level-4 therapeutic group
 * Every relation is informational; SIMILAR_USE products are never substitutes.
 */
export function compareMedicines(base: ComparableMedicine, other: ComparableMedicine): Comparison {
  const differences: string[] = []
  const baseIng = ingredientKey(base.ingredients)

  if (baseIng && baseIng === ingredientKey(other.ingredients)) {
    const baseKey = compositionKey(base.ingredients)
    const sameStrength = baseKey !== null && baseKey === compositionKey(other.ingredients)
    const sameForm = base.dosageForm === other.dosageForm
    if (!sameStrength) differences.push('Different strength')
    if (!sameForm) differences.push('Different dosage form')
    const sameRelease = releaseType(base.dosageFormDetail, base.name) === releaseType(other.dosageFormDetail, other.name)
    if (!sameRelease) differences.push('Different release mechanism (e.g. extended vs immediate release)')
    const routeOf = (r?: string | null) => (r ?? '').toLowerCase().split(/[,(]/)[0]!.trim()
    const sameRoute = !routeOf(base.route) || !routeOf(other.route) || routeOf(base.route) === routeOf(other.route)
    if (!sameRoute) differences.push('Different route of administration')
    const saltsDiffer = base.ingredients.some((bi) => {
      const oi = other.ingredients.find((x) => x.name === bi.name)
      return !!(oi && bi.salt && oi.salt && bi.salt !== oi.salt)
    })
    if (saltsDiffer) differences.push('Different salt of the same active ingredient')
    return { relation: sameStrength && sameForm && sameRelease && sameRoute ? 'SAME_COMPOSITION' : 'VARIANT', differences }
  }

  const baseNames = new Set(base.ingredients.map((i) => i.name))
  const otherNames = new Set(other.ingredients.map((i) => i.name))
  const shared = [...baseNames].filter((n) => otherNames.has(n))
  if (shared.length) {
    const added = [...otherNames].filter((n) => !baseNames.has(n)).map(displayIngredient)
    const missing = [...baseNames].filter((n) => !otherNames.has(n)).map(displayIngredient)
    if (added.length) differences.push(`Also contains ${added.join(', ')}`)
    if (missing.length) differences.push(`Does not contain ${missing.join(', ')}`)
    differences.push('Different combination — not interchangeable')
    return { relation: 'COMBINATION', differences }
  }

  const a = atcLevel4(base.atcCode)
  if (a && a === atcLevel4(other.atcCode)) {
    return { relation: 'SIMILAR_USE', differences: ['Different active ingredient(s) — not interchangeable'] }
  }
  return { relation: 'UNRELATED', differences: ['Different active ingredient(s)'] }
}

/**
 * Best-effort ingredients for a medicine that has no structured composition yet: the
 * composition text first, else generic name + strength. The generic name is ignored when it is
 * just the product name (the add form defaults it to that), so "Dolo 650" never becomes an
 * ingredient.
 */
export function deriveIngredients(m: {
  name?: string | null
  genericName?: string | null
  strength?: string | null
  composition?: string | null
}): Ingredient[] {
  const fromText = parseCompositionText(m.composition)
  if (fromText.length) return fromText
  const generic = m.genericName?.trim()
  if (!generic || (m.name && generic.toLowerCase() === m.name.trim().toLowerCase())) return []
  return ingredientsFromGeneric(generic, m.strength).filter((i) => i.name && !/\d/.test(i.name))
}
