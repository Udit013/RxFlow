/**
 * Medicine Normalizer
 * ─────────────────────────────────────────────────────────────────────────────
 * Converts free-text medicine input into structured, normalized components.
 *
 * Examples:
 *   "Dolo650"         → { brand: "Dolo", strength: "650", unit: "mg" }
 *   "Paracetamol 650mg tab" → { generic: "Paracetamol", strength: "650", unit: "mg", form: "TABLET" }
 *   "Pan-D 40"        → { brand: "Pan-D", strength: "40", unit: "mg" }
 */

export interface NormalizedMedicine {
  raw: string
  normalized: string
  brandName?: string
  genericName?: string
  strength?: string
  strengthNumeric?: number
  strengthUnit?: string
  dosageForm?: string
  packSize?: string
  manufacturer?: string
  tokens: string[]
  confidence: number
}

// ── Dosage form patterns ──────────────────────────────────────────────────────

const DOSAGE_FORM_PATTERNS: Array<{ pattern: RegExp; form: string }> = [
  { pattern: /\b(tab|tablet|tablets|tab\.)\b/i, form: 'TABLET' },
  { pattern: /\b(cap|capsule|capsules|cap\.)\b/i, form: 'CAPSULE' },
  { pattern: /\b(syrup|syr|suspension|susp)\b/i, form: 'SYRUP' },
  { pattern: /\b(inj|injection|amp|ampule)\b/i, form: 'INJECTION' },
  { pattern: /\b(cream|crm)\b/i, form: 'CREAM' },
  { pattern: /\b(oint|ointment)\b/i, form: 'OINTMENT' },
  { pattern: /\b(drops|drp|eye drops|ear drops)\b/i, form: 'DROPS' },
  { pattern: /\b(inhaler|inh|mdi|rotacap)\b/i, form: 'INHALER' },
  { pattern: /\b(gel)\b/i, form: 'GEL' },
  { pattern: /\b(lotion|lot)\b/i, form: 'LOTION' },
  { pattern: /\b(spray|nasal spray)\b/i, form: 'SPRAY' },
  { pattern: /\b(powder|pwd|sachet)\b/i, form: 'POWDER' },
  { pattern: /\b(patch|tds)\b/i, form: 'PATCH' },
]

// ── Strength patterns ─────────────────────────────────────────────────────────

const STRENGTH_PATTERN = /(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|iu|u|%|mEq|mmol)/i

// ── Pack size patterns ────────────────────────────────────────────────────────

const PACK_PATTERN = /(\d+)\s*(tablet|tab|cap|capsule|ml|gm|g|piece|strip|pcs)/i

// ── Common noise words to strip ───────────────────────────────────────────────

const NOISE_WORDS = new Set([
  'of', 'the', 'and', 'for', 'with', 'each', 'uses', 'how', 'does', 'side', 'effects',
  'india', 'ltd', 'limited', 'pvt', 'private', 'pharma', 'pharmaceuticals', 'labs',
  'composition', 'generic', 'brand', 'medicine', 'drug',
])

// ── Strength unit normalizer ──────────────────────────────────────────────────

function normalizeStrengthUnit(unit: string): string {
  const unitMap: Record<string, string> = {
    mg: 'mg', milligram: 'mg', milligrams: 'mg',
    mcg: 'mcg', µg: 'mcg', microgram: 'mcg',
    g: 'g', gm: 'g', gram: 'g',
    ml: 'ml', milliliter: 'ml',
    iu: 'IU', 'i.u.': 'IU',
  }
  return unitMap[unit.toLowerCase()] ?? unit.toLowerCase()
}

// ── Main normalizer function ──────────────────────────────────────────────────

export function normalizeMedicineName(input: string): NormalizedMedicine {
  const raw = input.trim()
  let working = raw

  // Remove special characters except hyphens and dots in dosage
  working = working.replace(/[^\w\s.\-()/%]/g, ' ')

  // Extract dosage form
  let dosageForm: string | undefined
  for (const { pattern, form } of DOSAGE_FORM_PATTERNS) {
    if (pattern.test(working)) {
      dosageForm = form
      working = working.replace(pattern, ' ')
      break
    }
  }

  // Extract strength
  let strength: string | undefined
  let strengthNumeric: number | undefined
  let strengthUnit: string | undefined
  const strengthMatch = working.match(STRENGTH_PATTERN)
  if (strengthMatch) {
    strengthNumeric = parseFloat(strengthMatch[1])
    strengthUnit = normalizeStrengthUnit(strengthMatch[2])
    strength = `${strengthNumeric}${strengthUnit}`
    working = working.replace(strengthMatch[0], ' ')
  } else {
    // Try bare number (e.g. "Dolo 650" where 650 implies mg)
    const bareNumMatch = working.match(/\b(\d{2,4})\b/)
    if (bareNumMatch) {
      strengthNumeric = parseFloat(bareNumMatch[1])
      // Infer unit from magnitude
      if (strengthNumeric > 1000) strengthUnit = 'mcg'
      else if (strengthNumeric >= 1) strengthUnit = 'mg'
      strength = `${strengthNumeric}${strengthUnit ?? 'mg'}`
    }
  }

  // Extract pack size
  let packSize: string | undefined
  const packMatch = working.match(PACK_PATTERN)
  if (packMatch) {
    packSize = packMatch[0].trim()
    working = working.replace(packMatch[0], ' ')
  }

  // Clean up remaining text to get brand/generic name
  const cleanedName = working
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => !NOISE_WORDS.has(w.toLowerCase()) && w.length > 1)
    .join(' ')

  // Tokenize for search
  const tokens = raw
    .toLowerCase()
    .split(/[\s\-_/]+/)
    .filter((t) => t.length > 1 && !NOISE_WORDS.has(t))

  // Build normalized string
  const parts = [cleanedName, strength, dosageForm?.toLowerCase()].filter(Boolean)
  const normalized = parts.join(' ').trim()

  // Confidence heuristic
  let confidence = 0.5
  if (strength) confidence += 0.2
  if (dosageForm) confidence += 0.15
  if (cleanedName.length > 2) confidence += 0.15
  confidence = Math.min(1.0, confidence)

  return {
    raw,
    normalized: normalized || raw,
    brandName: cleanedName || undefined,
    strength,
    strengthNumeric,
    strengthUnit,
    dosageForm,
    packSize,
    tokens,
    confidence,
  }
}

// ── Batch normalize ───────────────────────────────────────────────────────────

export function batchNormalize(inputs: string[]): NormalizedMedicine[] {
  return inputs.map(normalizeMedicineName)
}

// ── Extract all medicine mentions from free text ──────────────────────────────

export function extractMedicinesFromText(text: string): string[] {
  // Simple heuristic: lines or comma-separated items that look like medicine names
  const lines = text.split(/[\n,;]/g)
  return lines
    .map((line) => line.trim())
    .filter((line) => {
      if (line.length < 3) return false
      // Must have at least one capitalized word or a number (strength)
      return /[A-Z]/.test(line) || /\d/.test(line)
    })
}
