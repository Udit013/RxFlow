'use client'

import { useState } from 'react'
import { Plus, Trash2, Wand2 } from 'lucide-react'
import { parseCompositionText, displayIngredient } from '@rxflow/types'

export interface IngredientRow {
  name: string
  strength: string
  unit: string
}

const UNITS = ['mg', 'mcg', 'g', 'iu', 'unit', '%', 'mg/ml', 'mcg/ml', 'iu/ml', 'mcg/dose', 'mg/dose']
const UNIT_LABEL: Record<string, string> = { iu: 'IU', 'mg/ml': 'mg/mL', 'mcg/ml': 'mcg/mL', 'iu/ml': 'IU/mL', unit: 'units' }

/** Stored compositions → editable rows. */
export function rowsFromCompositions(compositions: { ingredient: string; strengthNum: number | null; unit: string }[] | undefined): IngredientRow[] {
  return (compositions ?? []).map((c) => ({
    name: displayIngredient(c.ingredient),
    strength: c.strengthNum === null || c.strengthNum === undefined ? '' : String(c.strengthNum),
    unit: c.unit || 'mg',
  }))
}

/** Editable rows → API payload (blank rows dropped). */
export function rowsToPayload(rows: IngredientRow[]) {
  return rows
    .filter((r) => r.name.trim())
    .map((r) => ({ name: r.name.trim(), strength: r.strength.trim() ? Number(r.strength) : null, unit: r.strength.trim() ? r.unit : null }))
}

/**
 * Structured active ingredients. Each strength is per unit of the product (per tablet, per mL,
 * per dose). "Fill from text" parses "Paracetamol 500mg + Caffeine 65mg" into rows.
 */
export function IngredientsEditor({ rows, onChange }: { rows: IngredientRow[]; onChange: (rows: IngredientRow[]) => void }) {
  const [text, setText] = useState('')
  const update = (i: number, patch: Partial<IngredientRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  function fillFromText() {
    const parsed = parseCompositionText(text)
    if (!parsed.length) return
    onChange(parsed.map((p) => ({ name: displayIngredient(p.name), strength: p.strength === null ? '' : String(p.strength), unit: p.unit ?? 'mg' })))
    setText('')
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className="input flex-1"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); fillFromText() } }}
          placeholder="Quick entry: Amoxicillin 500mg + Clavulanic acid 125mg"
          aria-label="Composition quick entry"
        />
        <button type="button" onClick={fillFromText} disabled={!text.trim()} className="btn-secondary whitespace-nowrap">
          <Wand2 className="w-4 h-4" /> Fill rows
        </button>
      </div>
      {rows.length > 0 && (
        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_6.5rem_6.5rem_auto] gap-2 items-center">
              <input className="input" value={r.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Active ingredient" aria-label={`Ingredient ${i + 1}`} />
              <input className="input" type="number" min="0" step="any" value={r.strength} onChange={(e) => update(i, { strength: e.target.value })} placeholder="Strength" aria-label={`Strength ${i + 1}`} />
              <select className="input" value={r.unit} onChange={(e) => update(i, { unit: e.target.value })} aria-label={`Unit ${i + 1}`}>
                {UNITS.map((u) => <option key={u} value={u}>{UNIT_LABEL[u] ?? u}</option>)}
              </select>
              <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="btn-ghost p-2" aria-label={`Remove ingredient ${i + 1}`}>
                <Trash2 className="w-4 h-4 text-surface-400" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => onChange([...rows, { name: '', strength: '', unit: 'mg' }])} className="text-xs text-brand-600 hover:underline inline-flex items-center gap-1">
          <Plus className="w-3 h-3" /> Add ingredient
        </button>
        <p className="text-2xs text-surface-400">Strength per tablet, capsule, mL or dose. Regional names (acetaminophen) are matched automatically.</p>
      </div>
    </div>
  )
}
