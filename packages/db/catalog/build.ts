/**
 * Builds the shared multi-country catalog snapshot from free, official open-data sources:
 *
 *   US  openFDA NDC Directory (U.S. FDA)                     — public domain (CC0)
 *   CA  Drug Product Database extract (Health Canada)        — Open Government Licence – Canada
 *   ATC level-4 group names: NLM RxNav / RxClass             — free NLM API
 *   Ingredient names are cross-checked against NLM RxNorm.
 *
 * Developer-run (needs network): `pnpm --filter @rxflow/db catalog:build [path/to/dpd/allfiles]`.
 * Writes catalog/snapshot/*.json, which is committed and loaded on deploy by catalog/load.ts —
 * production never calls these APIs.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  normalizeIngredientName, canonicalStrength, parseStrengthText, ingredientKey, compositionKey,
  formatStrength, mapDosageForm, regionalNames, atcLevel4, displayIngredient, type Ingredient,
} from '@rxflow/types'
import { TARGET_INGREDIENTS, REPACKAGER_HINTS } from './ingredients.js'
import { SOURCES, type SnapshotMedicine, type SnapshotClass, type ScheduleCode } from './types.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'snapshot')
const MAX_PER_GROUP_SINGLE = 8 // products kept per single-ingredient set, per country
const MAX_PER_GROUP_COMBO = 3 // per combination, per country
const MAX_COMBOS_PER_TARGET = 3
const MAX_INGREDIENTS = 3 // skip multi-symptom mixtures

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const KEEP_UPPER = new Set(['llc', 'lp', 'usa', 'us', 'uk', 'ulc', 'sa', 'ag', 'nv', 'bv', 'plc', 'hfa', 'er', 'xr', 'sr',
  'dr', 'cr', 'xl', 'la', 'odt', 'ec', 'ds', 'es', 'hct', 'ii', 'iii', 'iv', 'gsk', 'otc', 'ip', 'bp', 'usp', 'pm', 'hc'])
const title = (s: string) =>
  s.toLowerCase().replace(/\s+/g, ' ').trim()
    .replace(/[a-z][a-z0-9']*/g, (w) => (KEEP_UPPER.has(w) ? w.toUpperCase() : w === 'hcl' ? 'HCl' : w[0]!.toUpperCase() + w.slice(1)))
    .replace(/(\d)\s?(Mg|Mcg|G|Ml|Iu)\b/g, (_m, d: string, u: string) => `${d}${u === 'Ml' ? 'mL' : u === 'Iu' ? 'IU' : u.toLowerCase()}`)
    .replace(/\/(\d*)Ml\b/g, '/$1mL')
/** Append the strength unless the product name already states it ("Acetaminophen 325mg"). */
const withStrength = (brand: string, strength: string) => (/\d/.test(brand) ? brand : `${brand} ${strength}`.trim())
/** Innermost package without NDC codes: "1 BOTTLE in 1 CARTON (0067-…) / 20 TABLET in 1 BOTTLE" → "20 tablet in 1 bottle". */
const packOf = (desc: string | undefined) =>
  desc ? desc.split('/').pop()!.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim().toLowerCase() : null
const isRepackager = (labeler: string) => REPACKAGER_HINTS.some((h) => labeler.toLowerCase().includes(h))

async function getJson(url: string, attempt = 1): Promise<any> {
  const res = await fetch(url, { headers: { 'User-Agent': 'RxFlow catalog builder (open-data import)' } })
  if (res.status === 404) return null
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    await sleep(2000 * attempt)
    return getJson(url, attempt + 1)
  }
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

function strengthLabel(ingredients: Ingredient[]): string {
  return ingredients.map((i) => formatStrength(i.strength, i.unit)).join(' + ')
}

/** Keep a few distinct products per ingredient set: brands first, manufacturers before repackagers. */
function pick(rows: SnapshotMedicine[], targets: Set<string>): SnapshotMedicine[] {
  const byGroup = new Map<string, SnapshotMedicine[]>()
  for (const r of rows) {
    const key = r.ingredientKey
    if (!byGroup.has(key)) byGroup.set(key, [])
    byGroup.get(key)!.push(r)
  }
  const out: SnapshotMedicine[] = []
  const combosPerTarget = new Map<string, number>()
  const groups = [...byGroup.entries()].sort((a, b) => b[1].length - a[1].length)
  for (const [key, group] of groups) {
    const parts = key.split('+')
    if (parts.length > 1) {
      const target = parts.find((p) => targets.has(p))
      if (!target) continue
      const n = combosPerTarget.get(target) ?? 0
      if (n >= MAX_COMBOS_PER_TARGET) continue
      combosPerTarget.set(target, n + 1)
    } else if (!targets.has(key)) continue
    const cap = parts.length > 1 ? MAX_PER_GROUP_COMBO : MAX_PER_GROUP_SINGLE
    const ranked = [...group].sort((a, b) => score(b) - score(a) || a.sourceRef.localeCompare(b.sourceRef))
    const seen = new Set<string>()
    const kept: SnapshotMedicine[] = []
    // First pass: one per distinct (strength, form) so the group shows the range of variants;
    // second pass fills remaining slots with other brands.
    for (const pass of [0, 1]) {
      for (const r of ranked) {
        if (kept.length >= cap) break
        const sig = pass === 0
          ? `${r.compositionKey}|${r.dosageForm}|${r.dosageFormDetail}`
          : `${r.brandName.toLowerCase()}|${r.compositionKey}|${r.dosageForm}|${r.dosageFormDetail}`
        if (seen.has(sig) || kept.includes(r)) continue
        seen.add(sig)
        kept.push(r)
      }
    }
    out.push(...kept)
  }
  return out
}

function score(r: SnapshotMedicine): number {
  let s = 0
  if (r.brandName.toLowerCase() !== r.genericName.toLowerCase()) s += 4 // a real brand name
  if (!isRepackager(r.manufacturerName)) s += 3
  if (r.compositionKey) s += 2
  if (r.packSize) s += 1
  return s
}

// ── US: openFDA NDC directory ────────────────────────────────────────────────

function usSchedule(p: any): ScheduleCode {
  const dea = String(p.dea_schedule ?? '').toUpperCase()
  if (dea === 'CII') return 'SCHEDULE_X'
  if (['CIII', 'CIV', 'CV'].includes(dea)) return 'SCHEDULE_H1'
  return p.product_type === 'HUMAN OTC DRUG' ? 'OTC' : 'SCHEDULE_H'
}

async function buildUs(retrievedAt: string): Promise<SnapshotMedicine[]> {
  const rows: SnapshotMedicine[] = []
  const seenNdc = new Set<string>()
  for (const target of TARGET_INGREDIENTS) {
    const names = [target, ...regionalNames(target)]
    const query = names.map((n) => `generic_name:"${n}"`).join('+OR+')
    const url = `https://api.fda.gov/drug/ndc.json?search=(${encodeURIComponent(query).replace(/%2B/g, '+')})+AND+finished:true&limit=1000`
    const data = await getJson(url)
    await sleep(300) // openFDA allows 240 requests/minute without a key
    for (const p of data?.results ?? []) {
      if (seenNdc.has(p.product_ndc)) continue
      if (!['HUMAN PRESCRIPTION DRUG', 'HUMAN OTC DRUG'].includes(p.product_type)) continue
      if (/unapproved|bulk|export only/i.test(p.marketing_category ?? '')) continue
      if (/kit/i.test(p.dosage_form ?? '')) continue
      const actives: any[] = p.active_ingredients ?? []
      if (actives.length === 0 || actives.length > MAX_INGREDIENTS) continue
      const ingredients: Ingredient[] = actives.map((a) => {
        const { name, salt } = normalizeIngredientName(a.name)
        return { name, salt, ...parseStrengthText(a.strength) }
      })
      const ik = ingredientKey(ingredients)
      if (!ik || !ingredients.some((i) => i.name === target)) continue
      if (ingredients.every((i) => i.strength === null)) continue
      seenNdc.add(p.product_ndc)
      const brand = title(p.brand_name ?? p.generic_name)
      const setId = p.openfda?.spl_set_id?.[0]
      rows.push({
        source: 'OPENFDA_NDC',
        sourceRef: p.product_ndc,
        sourceUrl: setId
          ? `https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=${setId}`
          : `https://api.fda.gov/drug/ndc.json?search=product_ndc:%22${p.product_ndc}%22`,
        retrievedAt,
        country: 'US',
        name: withStrength(brand, strengthLabel(ingredients)),
        brandName: brand,
        genericName: title(p.generic_name ?? ingredients.map((i) => i.name).join(' and ')),
        manufacturerName: title(p.labeler_name ?? 'Unknown'),
        dosageForm: mapDosageForm(p.dosage_form, (p.route ?? []).join(', ')),
        dosageFormDetail: p.dosage_form ?? null,
        route: (p.route ?? []).join(', ') || null,
        strength: strengthLabel(ingredients),
        ingredients,
        ingredientKey: ik,
        compositionKey: compositionKey(ingredients),
        packSize: packOf(p.packaging?.[0]?.description),
        productCode: p.product_ndc,
        schedule: usSchedule(p),
        category: (p.pharm_class ?? []).find((c: string) => c.endsWith('[EPC]'))?.replace(/\s*\[EPC\]$/, '') ?? null,
        atcCode: null,
        aliases: [...new Set([p.generic_name, ...ingredients.map((i) => displayIngredient(i.name))].filter(Boolean).map(String))],
        barcodes: (p.openfda?.upc ?? []).slice(0, 3),
        verified: false,
      })
    }
    process.stdout.write(`US ${target}: ${rows.length} total\r`)
  }
  console.info(`\nUS candidates: ${rows.length}`)
  return rows
}

// ── CA: Health Canada Drug Product Database extract ──────────────────────────

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') quoted = false
      else cur += c
    } else if (c === '"') quoted = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out
}

function readDpd(dir: string, file: string): string[][] {
  return readFileSync(join(dir, file), 'utf8').split(/\r?\n/).filter(Boolean).map(parseCsvLine)
}

function groupBy(rows: string[][]): Map<string, string[][]> {
  const m = new Map<string, string[][]>()
  for (const r of rows) {
    const k = r[0]!
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(r)
  }
  return m
}

const CA_SCHEDULE_RANK: Record<string, [number, ScheduleCode]> = {
  'NON-PRESCRIPTION DRUGS': [0, 'OTC'],
  ETHICAL: [1, 'SCHEDULE_G'],
  'PRESCRIPTION RECOMMENDED': [1, 'SCHEDULE_G'],
  PRESCRIPTION: [2, 'SCHEDULE_H'],
  'SCHEDULE D': [2, 'SCHEDULE_H'],
  'SCHEDULE C': [2, 'SCHEDULE_H'],
  'TARGETED SUBSTANCES (CDSA IV)': [3, 'SCHEDULE_H1'],
  'CONTROLLED DRUGS (CDSA III)': [3, 'SCHEDULE_H1'],
  'CONTROLLED DRUGS (CDSA IV)': [3, 'SCHEDULE_H1'],
  'CONTROLLED DRUGS (CDSA I)': [3, 'SCHEDULE_H1'],
  'NARCOTICS (CDSA II)': [4, 'SCHEDULE_X'],
  'NARCOTICS (CDSA I)': [4, 'SCHEDULE_X'],
}

function buildCa(dir: string, retrievedAt: string): { rows: SnapshotMedicine[]; atcByDrug: Map<string, string> } {
  const targets = new Set(TARGET_INGREDIENTS)
  const ingred = groupBy(readDpd(dir, 'ingred.txt'))
  const forms = groupBy(readDpd(dir, 'form.txt'))
  const comps = groupBy(readDpd(dir, 'comp.txt'))
  const statuses = groupBy(readDpd(dir, 'status.txt'))
  const ther = groupBy(readDpd(dir, 'ther.txt'))
  const routes = groupBy(readDpd(dir, 'route.txt'))
  const schedules = groupBy(readDpd(dir, 'schedule.txt'))
  const packages = groupBy(readDpd(dir, 'package.txt'))
  const atcByDrug = new Map<string, string>()

  const rows: SnapshotMedicine[] = []
  for (const d of readDpd(dir, 'drug.txt')) {
    const [code, , cls, din, brandRaw, descriptor] = d
    if (cls !== 'Human' || !code || !din) continue
    const current = (statuses.get(code) ?? []).find((s) => s[1] === 'Y')
    if (current?.[2] !== 'MARKETED') continue
    const actives = ingred.get(code) ?? []
    if (actives.length === 0 || actives.length > MAX_INGREDIENTS) continue
    const ingredients: Ingredient[] = actives.map((a) => {
      const { name, salt } = normalizeIngredientName(a[2]!)
      const per = a[7] ? Number(a[7]) : a[9] ? 1 : null
      return { name, salt, ...canonicalStrength(a[4] ? Number(a[4]) : null, a[5], per, a[9] || null) }
    })
    if (!ingredients.some((i) => targets.has(i.name))) continue
    if (ingredients.every((i) => i.strength === null)) continue
    const ik = ingredientKey(ingredients)!
    const formText = (forms.get(code) ?? []).map((f) => f[2]).join(', ')
    const routeText = (routes.get(code) ?? []).map((r) => r[2]).join(', ')
    const atc = (ther.get(code) ?? [])[0]?.[1]
    if (atc) atcByDrug.set(code, atc)
    const sched = (schedules.get(code) ?? [])
      .map((s) => CA_SCHEDULE_RANK[s[1]!] ?? [2, 'SCHEDULE_H'] as [number, ScheduleCode])
      .sort((a, b) => b[0] - a[0])[0]?.[1] ?? 'SCHEDULE_H'
    const pkg = (packages.get(code) ?? [])[0]
    const brand = title(brandRaw!)
    rows.push({
      source: 'HC_DPD',
      sourceRef: din,
      sourceUrl: `https://health-products.canada.ca/dpd-bdpp/info?lang=eng&code=${code}`,
      retrievedAt,
      country: 'CA',
      name: withStrength(`${brand}${descriptor ? ` ${title(descriptor)}` : ''}`, strengthLabel(ingredients)),
      brandName: brand,
      genericName: ingredients.map((i) => displayIngredient(i.name)).join(' + '),
      manufacturerName: title((comps.get(code) ?? [])[0]?.[3] ?? 'Unknown'),
      dosageForm: mapDosageForm(formText, routeText),
      dosageFormDetail: formText || null,
      route: routeText ? title(routeText) : null,
      strength: strengthLabel(ingredients),
      ingredients,
      ingredientKey: ik,
      compositionKey: compositionKey(ingredients),
      packSize: pkg?.[4] ? `${pkg[4]} ${pkg[2] ?? ''}`.trim().toLowerCase() : pkg?.[5] || null,
      productCode: din,
      schedule: sched,
      category: null,
      atcCode: atc ?? null,
      aliases: [...new Set(actives.map((a) => title(a[2]!.replace(/\s*\(.*\)\s*$/, ''))))],
      barcodes: [],
      verified: false,
    })
  }
  console.info(`CA candidates: ${rows.length}`)
  return { rows, atcByDrug }
}

// ── Classification and verification ──────────────────────────────────────────

/** Most common ATC code per ingredient set across Health Canada products. */
function classesFrom(rows: SnapshotMedicine[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>()
  for (const r of rows) {
    if (!r.atcCode) continue
    if (!counts.has(r.ingredientKey)) counts.set(r.ingredientKey, new Map())
    const m = counts.get(r.ingredientKey)!
    m.set(r.atcCode, (m.get(r.atcCode) ?? 0) + 1)
  }
  const out = new Map<string, string>()
  for (const [k, m] of counts) {
    // Prefer full level-5 codes, then the most frequent.
    const best = [...m.entries()].sort((a, b) => (b[0].length >= 7 ? 1 : 0) - (a[0].length >= 7 ? 1 : 0) || b[1] - a[1])[0]
    if (best) out.set(k, best[0])
  }
  return out
}

async function atcNames(codes: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (const code of codes) {
    const data = await getJson(`https://rxnav.nlm.nih.gov/REST/rxclass/class/byId.json?classId=${code}`)
    const name = data?.rxclassMinConceptList?.rxclassMinConcept?.[0]?.className
    if (name) out.set(code, name)
    await sleep(80)
  }
  return out
}

/** An ingredient is verified when NLM RxNorm knows it (under its INN or regional name). */
async function verifyIngredients(names: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  for (const name of names) {
    let rxcui: string | null = null
    for (const candidate of [name, ...regionalNames(name)]) {
      const data = await getJson(`https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(candidate)}&search=2`)
      rxcui = data?.idGroup?.rxnormId?.[0] ?? null
      await sleep(80)
      if (rxcui) break
    }
    out.set(name, rxcui)
  }
  return out
}

async function main() {
  const dpdDir = process.argv[2]
  if (!dpdDir || !existsSync(join(dpdDir, 'drug.txt'))) {
    console.error('Usage: tsx catalog/build.ts <dir with the unzipped Health Canada DPD allfiles extract>')
    console.error('Download: https://www.canada.ca/content/dam/hc-sc/documents/services/drug-product-database/allfiles.zip')
    process.exit(1)
  }
  const retrievedAt = new Date().toISOString()
  const version = retrievedAt.slice(0, 10)
  const targets = new Set(TARGET_INGREDIENTS)

  const ca = buildCa(dpdDir, retrievedAt)
  const us = await buildUs(retrievedAt)
  const atcByKey = classesFrom(ca.rows)
  const caPicked = pick(ca.rows, targets)
  const usPicked = pick(us, targets)
  const all = [...usPicked, ...caPicked]

  // Classification: every row whose ingredient set Health Canada classifies gets that ATC code.
  for (const r of all) r.atcCode = r.atcCode ?? atcByKey.get(r.ingredientKey) ?? null
  const level4 = [...new Set([...atcByKey.values()].map(atcLevel4).filter((x): x is string => !!x))].sort()
  console.info(`Looking up ${level4.length} ATC group names…`)
  const names = await atcNames(level4)
  const classes: SnapshotClass[] = [...atcByKey.entries()].map(([key, atc]) => ({
    ingredientKey: key,
    atcCode: atc,
    className: names.get(atcLevel4(atc)!) ?? null,
    source: 'HC_DPD',
  })).sort((a, b) => a.ingredientKey.localeCompare(b.ingredientKey))
  const classByKey = new Map(classes.map((c) => [c.ingredientKey, c]))
  for (const r of all) r.therapeuticClass = classByKey.get(r.ingredientKey)?.className ?? null

  // Verification: ingredient names resolve in RxNorm, strengths parsed, cross-source agreement.
  const moieties = [...new Set(all.flatMap((r) => r.ingredients.map((i) => i.name)))].sort()
  console.info(`Verifying ${moieties.length} ingredient names against RxNorm…`)
  const rx = await verifyIngredients(moieties)
  for (const r of all) r.verified = r.ingredients.every((i) => rx.get(i.name)) && r.compositionKey !== null

  // Safety gates: a route/form contradiction means the mapping is wrong — fail instead of shipping it.
  const contradictions = all.filter((r) => {
    const route = (r.route ?? '').toLowerCase()
    if (/inhal|respiratory/.test(route) && !['INHALER', 'SOLUTION'].includes(r.dosageForm)) return true
    if (/intravenous|intramuscular|subcutaneous/.test(route) && !/oral|topical/.test(route) && r.dosageForm !== 'INJECTION') return true
    if (r.dosageForm === 'INJECTION' && /^(oral|topical)$/.test(route)) return true
    return false
  })
  if (contradictions.length) {
    console.error('Route/form contradictions:', contradictions.slice(0, 20).map((r) => [r.name, r.dosageForm, r.route]))
    process.exit(1)
  }

  const keysUs = new Set(usPicked.map((r) => r.ingredientKey))
  const keysCa = new Set(caPicked.map((r) => r.ingredientKey))
  const both = [...keysUs].filter((k) => keysCa.has(k))
  const missingTargets = TARGET_INGREDIENTS.filter((t) => !all.some((r) => r.ingredientKey === t))
  const manifest = {
    version,
    generatedAt: retrievedAt,
    sources: SOURCES,
    counts: { US: usPicked.length, CA: caPicked.length, total: all.length, classes: classes.length },
    verification: {
      ingredientsChecked: moieties.length,
      ingredientsInRxNorm: [...rx.values()].filter(Boolean).length,
      ingredientsNotInRxNorm: moieties.filter((m) => !rx.get(m)),
      rowsVerified: all.filter((r) => r.verified).length,
      rowsWithoutParsedStrength: all.filter((r) => !r.compositionKey).length,
      routeFormContradictions: contradictions.length,
      ingredientSetsInBothCountries: both.length,
      targetsWithoutSingleIngredientProducts: missingTargets,
    },
  }

  mkdirSync(OUT, { recursive: true })
  const write = (file: string, data: unknown) => writeFileSync(join(OUT, file), JSON.stringify(data, null, 1) + '\n')
  write('us-openfda.json', usPicked)
  write('ca-dpd.json', caPicked)
  write('classes.json', classes)
  write('manifest.json', manifest)
  console.info(JSON.stringify(manifest, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
