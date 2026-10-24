import { getRegionProfile, REGION_PROFILES } from '@rxflow/regional'
import { BadgeCheck, Database, FlaskConical, PencilLine, Upload } from 'lucide-react'

const FORM_LABELS: Record<string, string> = {
  TABLET: 'Tablet', CAPSULE: 'Capsule', SYRUP: 'Syrup', SOLUTION: 'Solution', SUSPENSION: 'Suspension',
  INJECTION: 'Injection', DROPS: 'Drops', INHALER: 'Inhaler', CREAM: 'Cream', OINTMENT: 'Ointment', GEL: 'Gel',
  LOTION: 'Lotion', SPRAY: 'Spray', POWDER: 'Powder', PATCH: 'Patch', SUPPOSITORY: 'Suppository', OTHER: 'Other',
}
export const formLabel = (form: string) => FORM_LABELS[form] ?? form

/** "🇨🇦 Canada" for a market code; "International" for none. */
export function CountryTag({ code }: { code: string | null | undefined }) {
  if (!code) return <span>🌐 International</span>
  const known = REGION_PROFILES[code.toUpperCase()]
  const p = known ? getRegionProfile(code) : null
  return <span title={p?.name ?? code}>{p ? `${p.flag} ${p.name}` : code}</span>
}

const SOURCE_LABELS: Record<string, { label: string; title: string; icon: typeof Database; cls: string }> = {
  OPENFDA_NDC: { label: 'US FDA', title: 'U.S. FDA National Drug Code Directory (openFDA)', icon: Database, cls: 'badge-info' },
  HC_DPD: { label: 'Health Canada', title: 'Health Canada Drug Product Database', icon: Database, cls: 'badge-info' },
  DEMO_SEED: { label: 'Demo data', title: 'Illustrative demo entry — not verified against a register', icon: FlaskConical, cls: 'badge-warning' },
  MANUAL: { label: 'Added manually', title: 'Entered by a pharmacy', icon: PencilLine, cls: 'badge-neutral' },
  BULK_IMPORT: { label: 'CSV import', title: 'Imported from a CSV by a pharmacy', icon: Upload, cls: 'badge-neutral' },
}

export function SourceBadge({ source, verified }: { source: string | null | undefined; verified?: boolean }) {
  const s = SOURCE_LABELS[source ?? 'MANUAL'] ?? SOURCE_LABELS.MANUAL!
  const Icon = s.icon
  return (
    <span className={`${s.cls} text-2xs inline-flex items-center gap-1`} title={s.title}>
      <Icon className="w-3 h-3" /> {s.label}
      {verified && <BadgeCheck className="w-3 h-3" aria-label="Ingredients verified against NLM RxNorm" />}
    </span>
  )
}
