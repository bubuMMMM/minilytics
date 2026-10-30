import type { ReactNode } from 'react';
import { InfoTip } from './InfoTip';
import { UiIcon } from './UiIcon';

/** KPI tile with inline explanation and a stable skeleton (pattern adapted from 21st.dev “Stats cards with links”). */
export function StatCard({ label, value, hint, help, icon, loading, accent = false }: {
  label: string; value: ReactNode; hint?: ReactNode; help?: string; icon: Parameters<typeof UiIcon>[0]['name']; loading?: boolean; accent?: boolean;
}) {
  return (
    <div className={`ml-bento min-w-0 p-4 sm:p-5 ${accent ? 'ring-1 ring-accent/30' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-0.5 text-[12px] font-medium text-ink-3">
          <span className="min-w-0 leading-snug">{label}</span>
          {help && <InfoTip text={help} label={`Comment est calculé « ${label} » ?`} />}
        </span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent" aria-hidden><UiIcon name={icon} size={16} /></span>
      </div>
      <div className="tnum mt-2 h-[34px] text-[clamp(22px,2.4vw,28px)] font-semibold leading-[34px] tracking-[-.04em] text-ink">
        {loading ? <span className="ml-skeleton inline-block h-7 w-24 align-middle" aria-label="Chargement…" /> : value}
      </div>
      <div className="mt-1 min-h-[16px] text-[11px] text-ink-3">{loading ? '' : hint}</div>
    </div>
  );
}
