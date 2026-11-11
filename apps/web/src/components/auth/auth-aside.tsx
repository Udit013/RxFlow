import { BrandMark } from '@/components/brand-mark'

/** The left-hand cover of the sign-in and sign-up screens (desktop only). */
export function AuthAside({ title, lede, points }: { title: React.ReactNode; lede: string; points: string[] }) {
  return (
    <aside className="hidden lg:flex lg:w-[42%] xl:w-[40%] bg-brand-950 text-paper flex-col justify-between p-12 xl:p-14">
      <BrandMark inverted />

      <div className="max-w-sm">
        <h1 className="font-display text-[34px] font-semibold leading-[1.1] tracking-[-0.02em]">{title}</h1>
        <p className="text-brand-100/75 text-[15px] mt-4 leading-relaxed">{lede}</p>

        <ol className="mt-10">
          {points.map((text, i) => (
            <li key={text} className="flex items-baseline gap-4 py-3 border-t border-white/10 last:border-b">
              <span className="font-mono text-[11px] text-brand-300/80 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
              <span className="text-[13px] text-brand-50/90">{text}</span>
            </li>
          ))}
        </ol>
      </div>

      <p className="text-xs text-brand-200/50">© 2026 RxFlow · made in India, for pharmacies everywhere</p>
    </aside>
  )
}
