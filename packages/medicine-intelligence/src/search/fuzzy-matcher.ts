/**
 * Fuzzy Medicine Matcher
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-strategy matching engine:
 *   1. Exact match (name, brand, generic)
 *   2. Alias match (known synonyms)
 *   3. Barcode match
 *   4. Fuzzy match (Fuse.js — typo tolerant)
 *   5. Composition match (generic ingredient)
 *   6. Token overlap match
 *
 * Returns ranked results with match type and confidence score.
 */

import Fuse from 'fuse.js'
import { normalizeMedicineName } from '../normalizer/index.js'

export interface MedicineRecord {
  id: string
  name: string
  genericName: string
  brandName: string
  manufacturerName: string
  strength: string
  dosageForm: string
  packSize: string
  mrp: number
  schedule: string
  aliases: string[]
  barcodes: string[]
  searchTokens: string[]
}

export interface MatchResult {
  medicine: MedicineRecord
  score: number
  matchType: 'EXACT' | 'ALIAS' | 'BARCODE' | 'FUZZY' | 'COMPOSITION' | 'TOKEN'
  matchedOn: string
}

export class FuzzyMedicineMatcher {
  private medicines: MedicineRecord[] = []
  private fuseByName!: Fuse<MedicineRecord>
  private fuseByGeneric!: Fuse<MedicineRecord>
  private aliasIndex: Map<string, MedicineRecord[]> = new Map()
  private barcodeIndex: Map<string, MedicineRecord> = new Map()
  private exactIndex: Map<string, MedicineRecord[]> = new Map()

  constructor(medicines: MedicineRecord[]) {
    this.loadMedicines(medicines)
  }

  loadMedicines(medicines: MedicineRecord[]) {
    this.medicines = medicines
    this.buildIndexes()
  }

  private buildIndexes() {
    this.aliasIndex.clear()
    this.barcodeIndex.clear()
    this.exactIndex.clear()

    for (const med of this.medicines) {
      // Exact name index
      const nameKey = med.name.toLowerCase().trim()
      if (!this.exactIndex.has(nameKey)) this.exactIndex.set(nameKey, [])
      this.exactIndex.get(nameKey)!.push(med)

      // Brand name index
      const brandKey = med.brandName.toLowerCase().trim()
      if (!this.exactIndex.has(brandKey)) this.exactIndex.set(brandKey, [])
      this.exactIndex.get(brandKey)!.push(med)

      // Alias index
      for (const alias of med.aliases) {
        const aliasKey = alias.toLowerCase().trim()
        if (!this.aliasIndex.has(aliasKey)) this.aliasIndex.set(aliasKey, [])
        this.aliasIndex.get(aliasKey)!.push(med)
      }

      // Barcode index
      for (const barcode of med.barcodes) {
        this.barcodeIndex.set(barcode, med)
      }
    }

    // Fuse.js for fuzzy search on name
    this.fuseByName = new Fuse(this.medicines, {
      keys: ['name', 'brandName'],
      threshold: 0.4,
      distance: 100,
      includeScore: true,
      useExtendedSearch: true,
    })

    // Fuse.js for fuzzy search on generic/composition
    this.fuseByGeneric = new Fuse(this.medicines, {
      keys: ['genericName', 'searchTokens'],
      threshold: 0.3,
      distance: 100,
      includeScore: true,
    })
  }

  search(query: string, limit = 10): MatchResult[] {
    const results: MatchResult[] = []
    const seenIds = new Set<string>()

    const addResult = (med: MedicineRecord, score: number, matchType: MatchResult['matchType'], matchedOn: string) => {
      if (!seenIds.has(med.id)) {
        seenIds.add(med.id)
        results.push({ medicine: med, score, matchType, matchedOn })
      }
    }

    const normalizedQuery = normalizeMedicineName(query)
    const queryLower = query.toLowerCase().trim()
    const queryNormLower = normalizedQuery.normalized.toLowerCase()

    // ── 1. Barcode match ─────────────────────────────────────────────────────
    const barcodeMatch = this.barcodeIndex.get(query)
    if (barcodeMatch) {
      addResult(barcodeMatch, 1.0, 'BARCODE', query)
    }

    // ── 2. Exact name match ───────────────────────────────────────────────────
    for (const [key, meds] of this.exactIndex) {
      if (key === queryLower || key === queryNormLower) {
        for (const med of meds) {
          addResult(med, 1.0, 'EXACT', key)
        }
      }
    }

    // ── 3. Alias match ────────────────────────────────────────────────────────
    for (const [key, meds] of this.aliasIndex) {
      if (key === queryLower || key === queryNormLower) {
        for (const med of meds) {
          addResult(med, 0.95, 'ALIAS', key)
        }
      }
    }

    // ── 4. Fuzzy name match ───────────────────────────────────────────────────
    const fuseNameResults = this.fuseByName.search(query, { limit: 5 })
    for (const r of fuseNameResults) {
      const score = 1 - (r.score ?? 0.5)
      addResult(r.item, score * 0.85, 'FUZZY', r.item.name)
    }

    // ── 5. Generic/composition fuzzy match ────────────────────────────────────
    if (normalizedQuery.genericName || results.length < 3) {
      const fuseGenericResults = this.fuseByGeneric.search(
        normalizedQuery.genericName ?? query, { limit: 5 }
      )
      for (const r of fuseGenericResults) {
        const score = 1 - (r.score ?? 0.5)
        addResult(r.item, score * 0.75, 'COMPOSITION', r.item.genericName)
      }
    }

    // ── 6. Token overlap match ────────────────────────────────────────────────
    if (results.length < 3) {
      const queryTokens = new Set(normalizedQuery.tokens)
      for (const med of this.medicines) {
        if (seenIds.has(med.id)) continue
        const medTokens = new Set([...med.searchTokens, ...med.aliases.map((a) => a.toLowerCase())])
        const overlap = [...queryTokens].filter((t) => medTokens.has(t)).length
        if (overlap > 0) {
          const score = overlap / Math.max(queryTokens.size, medTokens.size)
          addResult(med, score * 0.65, 'TOKEN', `tokens:${[...queryTokens].join(',')}`)
        }
      }
    }

    // Sort by score descending and limit
    return results.sort((a, b) => b.score - a.score).slice(0, limit)
  }

  // ── Strength-aware search ─────────────────────────────────────────────────

  searchWithStrengthFilter(query: string, limit = 10): MatchResult[] {
    const normalized = normalizeMedicineName(query)
    const baseResults = this.search(query, limit * 2)

    if (!normalized.strengthNumeric) return baseResults.slice(0, limit)

    // Boost exact strength matches
    return baseResults
      .map((r) => {
        const medStrengthMatch = r.medicine.strength.match(/(\d+(?:\.\d+)?)/)
        const medStrength = medStrengthMatch ? parseFloat(medStrengthMatch[1]) : 0
        if (medStrength === normalized.strengthNumeric) {
          return { ...r, score: Math.min(1.0, r.score + 0.1) }
        }
        return r
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }
}

// ── Singleton factory for use across the app ──────────────────────────────────

let matcherInstance: FuzzyMedicineMatcher | null = null

export function getMatcher(): FuzzyMedicineMatcher {
  if (!matcherInstance) {
    matcherInstance = new FuzzyMedicineMatcher([])
  }
  return matcherInstance
}

export async function initializeMatcher(medicines: MedicineRecord[]) {
  if (!matcherInstance) {
    matcherInstance = new FuzzyMedicineMatcher(medicines)
  } else {
    matcherInstance.loadMedicines(medicines)
  }
  return matcherInstance
}
