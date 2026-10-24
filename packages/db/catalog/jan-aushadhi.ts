/**
 * India: the Pradhan Mantri Bhartiya Janaushadhi Pariyojana (PMBJP) product & MRP list,
 * published by the Pharmaceuticals & Medical Devices Bureau of India at
 * https://janaushadhi.gov.in/product-portfolio/product-mrp-list. The public page loads it with a
 * guest token issued to every visitor; we read the same list, once, at build time.
 *
 * Product names follow pharmacopoeia style ("Aceclofenac Tablets IP 100 mg",
 * "Labetalol Injection IP 5 mg per ml", "Paracetamol 325mg and Tramadol 37.5mg Tablets"), so the
 * composition is parsed from the name. Rows whose ingredients can't all be read with a strength
 * keep the official name but get no structured composition (and are never marked verified).
 */
import {
  parseCompositionText, ingredientKey, compositionKey, formatStrength, mapDosageForm, displayIngredient,
  type Ingredient,
} from '@rxflow/types'
import type { ScheduleCode, SnapshotMedicine } from './types.js'

const BASE = 'https://janaushadhi.gov.in:8443'
export const JA_LIST_URL = 'https://janaushadhi.gov.in/product-portfolio/product-mrp-list'

export interface JaProduct {
  drugCode: number
  genericName: string
  groupName: string
  unitSize: string
  mrp: number | null
  status: number
}

export async function fetchJanAushadhi(): Promise<JaProduct[]> {
  const headers = { Origin: 'https://janaushadhi.gov.in', 'Content-Type': 'application/json' }
  const tokenRes = await fetch(`${BASE}/auth/generateGuestToken`, { headers })
  const token = (await tokenRes.json()).responseBody as string
  const res = await fetch(`${BASE}/api/v1/website/getAllProductForWeb`, {
    method: 'POST',
    headers: { ...headers, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ pageIndex: 0, pageSize: 100000, searchText: '', orderBy: 'asc', columnName: 'drug_code' }),
  })
  if (!res.ok) throw new Error(`Jan Aushadhi list: HTTP ${res.status}`)
  return (await res.json()).responseBody.newProductResponsesList as JaProduct[]
}

/** Not medicines (foods, devices, Ayurvedic) — the catalog is for allopathic products. */
const EXCLUDED_GROUPS = new Set(['Surgical & Medical Consumables', 'Nutraceuticals', 'Ayurvedic'])

/** Groups sold without a prescription. Everything else defaults to Schedule H (see notes). */
const OTC_GROUPS = new Set(['Supplement/Vitamin/Mineral', 'Derma Care', 'Antiseptic/Disinfectants', 'Burn Relief', 'Stomatologicals'])

const FORM_WORDS =
  'tablets?|capsules?|injections?|infusion|syrup|suspension|solution|drops?|cream|ointment|gel|lotion|soap|' +
  'dusting powder|powder|granules|sachets?|nasal spray|spray|inhaler|rotacaps?|respules?|transpules?|patch|' +
  'suppositor(?:y|ies)|pessar(?:y|ies)|liquid|emulsion|shampoo|mouth ?wash|paste|lozenges?|elixir|linctus|jelly|' +
  'oral drops|eye drops?|ear drops?'
const FORM_RE = new RegExp(`((?:(?:film[- ]coated|enteric[- ]coated|gastro[- ]resistant|dispersible|chewable|mouth[- ]dissolving|orally disintegrating|effervescent|(?:modified|prolonged|sustained|extended|controlled|delayed)[- ]release|vaginal|soft gelatin|oral|eye|ear|nasal|topical|antiseptic|medicated|nebuli[sz]er|dry|for)\\s+)*(?:${FORM_WORDS}))\\b`, 'i')

function routeFor(text: string, form: string): string | null {
  const s = `${text} ${form}`.toLowerCase()
  if (/\beye\b|ophthalmic/.test(s)) return 'Ophthalmic'
  if (/\bear\b|otic/.test(s)) return 'Otic'
  if (/nasal/.test(s)) return 'Nasal'
  if (/vaginal|pessar/.test(s)) return 'Vaginal'
  if (/suppositor/.test(s)) return 'Rectal'
  if (/inject|infusion|pre-?filled|\bpen\b|syringe|\bvial\b|ampoule/.test(s)) return 'Parenteral'
  if (/rotacap|inhaler|respule|transpule|nebuli|respirator|inhalation/.test(s)) return 'Inhalation'
  if (/cream|ointment|\bgel\b|lotion|soap|dusting|shampoo|antiseptic|topical|spray/.test(s)) return 'Topical'
  if (/mouth ?wash|paste|lozenge/.test(s)) return 'Oromucosal'
  return 'Oral'
}

const title = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * Misspellings in the published list, corrected for ingredient matching only — the product keeps
 * its official name. Each was checked against the INN / RxNorm spelling.
 */
const SPELLING_FIXES: [RegExp, string][] = [
  [/\bcetrizine\b/gi, 'cetirizine'], [/\blevocetrizine\b/gi, 'levocetirizine'], [/\bglimipride\b/gi, 'glimepiride'],
  [/\bnortryptyline\b/gi, 'nortriptyline'], [/\bofloxaxin\b/gi, 'ofloxacin'], [/\bvildaglipitin\b/gi, 'vildagliptin'],
  [/\bhydrchloride\b/gi, 'hydrochloride'], [/\bmagnessium\b/gi, 'magnesium'], [/\boxelate\b/gi, 'oxalate'],
  [/\bisosorbidemononitrate\b/gi, 'isosorbide mononitrate'], [/\btazobactum\b/gi, 'tazobactam'],
  [/\btrihexiphenidyl\b/gi, 'trihexyphenidyl'], [/\bmegaldrate\b/gi, 'magaldrate'], [/\bdi-cloxacillin\b/gi, 'dicloxacillin'],
  [/\blevo-thyroxine\b/gi, 'levothyroxine'], [/\bcarboxymethlycellulose\b/gi, 'carboxymethylcellulose'],
  [/\bmethylsalicylate\b/gi, 'methyl salicylate'], [/\bdithylamine\b/gi, 'diethylamine'], [/\bmethylsulphate\b/gi, 'methylsulfate'],
  [/\bsodium picosulphate\b|\bpicosulphate\b/gi, 'sodium picosulfate'], [/\bsulfates\b/gi, 'sulfate'],
  [/\bnicoumalone\s*\/\s*acenocoumarol\b/gi, 'acenocoumarol'], [/\bnicoumalone\b/gi, 'acenocoumarol'], [/\bmethyl ergometrine\b/gi, 'methylergometrine'], [/\btabelts\b/gi, 'tablets'],
  [/\bcapulses\b/gi, 'capsules'], [/\bopthalmic\b/gi, 'ophthalmic'], [/\bintravenouse\b/gi, 'intravenous'],
  [/\bgama benzene hexachloride\b/gi, 'lindane'], [/\bglargine\b/gi, 'insulin glargine'], [/\binsulin insulin\b/gi, 'insulin'],
  [/\bl-\s+/gi, 'l-'],
]

/** Product descriptors that are not part of an ingredient name. */
const DESCRIPTORS = new RegExp(
  '\\b(?:' + [
    'gastro[- ]?resistan(?:t|ce)', 'enteric[- ]coated', '(?:sustained|prolonged|extended|controlled|modified|delayed)[- ]release',
    'long acting release', '\\bmr\\b', 'orally disintegrating strips?', 'oral disintegrating strips?', 'oro(?=\\s|$)',
    'concentrate for infusion', 'for (?:concentrate for )?infusion', 'for intravenous(?: use)?', 'for injection', 'for inhalation',
    'for oral(?: suspension| solution)?', 'inhalation', 'respirator(?:y)?(?: solution)?', 'intravenous', 'in pre-filled syringe',
    'pre-filled(?: disposable)? (?:pen|syringe)', 'vial', 'soft', 'expectorant', 'ophthalmic', 'eye', 'dental', 'mouth paint',
    'mouth ulcer', 'aqueous', 'gargle', 'sterile', 'sachet', 'chewing gum', 'combi kit', 'combipack of', 'paediatric', 'pediatric',
    'tablets?', 'capsules?', 'rotacaps?', 'concentrate', 'for\\b',
  ].join('|') + ')',
  'gi',
)

export function parseJanAushadhi(p: JaProduct, retrievedAt: string): SnapshotMedicine | null {
  if (EXCLUDED_GROUPS.has(p.groupName) || !p.mrp || p.mrp <= 0 || p.status !== 1) return null
  const raw = title(p.genericName)
  const formMatch = raw.match(FORM_RE)
  const formText = formMatch ? formMatch[1]!.toLowerCase() : ''
  const route = routeFor(raw, formText)

  // Composition text: drop the form phrase, pharmacopoeia marks and parenthetical notes;
  // "25mg per ml" → "25mg/ml", "0.005% w/v" → "0.005%".
  // When the strengths sit inside brackets ("Co-trimoxazole (Sulphamethoxazole 800mg and
  // Trimethoprim 160mg) Tablets"), the brackets ARE the composition.
  // "… Oral Suspension IP per 5ml" — a per-volume clause after the form applies to EVERY
  // ingredient, not just the last one. Lift it off and apply it after parsing.
  const trailingPer = raw.match(new RegExp(`${FORM_RE.source}[^()]*?\\bper\\s*(\\d+(?:\\.\\d+)?)?\\s*ml\\s*$`, 'i'))
  const perMl = trailingPer ? Number(trailingPer[trailingPer.length - 1] ?? 1) || 1 : null
  const rawForComp = perMl ? raw.replace(/\bper\s*(\d+(?:\.\d+)?)?\s*ml\s*$/i, '') : raw
  const outside = rawForComp.replace(/\((?:[^()]*)\)/g, ' ')
  const bracketed = rawForComp.match(/\(([^()]*\d\s*(?:mg|mcg|g|iu|%)[^()]*)\)/i)?.[1]
  const source = /\d\s*(?:mg|mcg|g|iu|%)/i.test(outside.replace(FORM_RE, ' ')) || !bracketed ? outside : bracketed
  const compText = source
    .replace(FORM_RE, ' ')
    .replace(/\b(?:I\.?P|B\.?P|U\.?S\.?P|Ph\.?\s?Eur)\b\.?/gi, ' ')
    .replace(/\bper\s*(?=\d)|\bper\b/gi, '/')
    .replace(/(\d)\s*%\s*[wv]\s*\/\s*[wv]/gi, '$1%')
    .replace(/\bMg\b/g, 'mg')
  const cleaned = SPELLING_FIXES.reduce((t, [re, to]) => t.replace(re, to), compText)
    .split(/(\s*(?:\+|,|;|&|\band\b|\bwith\b)\s*)/i)
    .map((part) => part.replace(DESCRIPTORS, ' '))
    .join('')
    .replace(/\b(\w+)\s+\1\b/gi, '$1') // "Nicoumalone (Acenocoumarol)" → "acenocoumarol acenocoumarol"
    .replace(/^\s*-\s*/, '')
    .replace(/\s+\.(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  let ingredients: Ingredient[] = parseCompositionText(cleaned)
  if (perMl) {
    ingredients = ingredients.map((i) =>
      i.strength !== null && i.unit && !i.unit.includes('/') && i.unit !== '%'
        ? { ...i, strength: Number((i.strength / perMl).toPrecision(6)), unit: `${i.unit}/ml` }
        : i,
    )
  }
  // Only trust a parse where every ingredient has a strength and a plausible name.
  if (!ingredients.length || ingredients.some((i) => i.strength === null || i.name.length < 3 || /\d/.test(i.name))) ingredients = []

  const ik = ingredientKey(ingredients)
  const mapped = mapDosageForm(formText || raw, route)
  const dosageForm = mapped === 'OTHER' && route === 'Parenteral' ? 'INJECTION' : mapped
  const releaseWords = (raw.match(/(enteric[- ]coated|gastro[- ]resistant|(?:modified|prolonged|sustained|extended|controlled|delayed)[- ]release)/gi) ?? [])
    .map((w) => w.toLowerCase())
  const detail = [formText, ...new Set(releaseWords)].filter(Boolean).join(', ') || null
  const schedule: ScheduleCode = OTC_GROUPS.has(p.groupName) ? 'OTC' : 'SCHEDULE_H'

  return {
    source: 'JAN_AUSHADHI',
    sourceRef: String(p.drugCode),
    sourceUrl: JA_LIST_URL,
    retrievedAt,
    country: 'IN',
    name: raw,
    brandName: 'Jan Aushadhi',
    genericName: ik ? ingredients.map((i) => displayIngredient(i.name)).join(' + ') : raw,
    manufacturerName: 'PMBI (Jan Aushadhi)',
    dosageForm,
    dosageFormDetail: detail,
    route,
    strength: ingredients.length ? ingredients.map((i) => formatStrength(i.strength, i.unit)).join(' + ') : 'See name',
    ingredients,
    ingredientKey: ik ?? '',
    compositionKey: compositionKey(ingredients),
    packSize: title(p.unitSize) || null,
    productCode: `JA${p.drugCode}`,
    schedule,
    category: p.groupName,
    atcCode: null,
    aliases: [`JA ${p.drugCode}`],
    barcodes: [],
    mrp: p.mrp,
    gstRate: 5, // medicines: 5% GST from 22 Sep 2025 (some life-saving drugs are nil — adjust per item)
    verified: false,
  }
}
