import { EmptyState } from './ui';
import type { ReactNode } from 'react';
import { fmtNumber } from '../lib/format';

/** Compact ranked list with proportional bars (used by Bots IA and imported data). */
export function BarList({ rows, empty = 'Aucune donnée sur cette période.', unit }: { rows: { key: string; label: ReactNode; value: number; extra?: ReactNode }[]; empty?: string; unit?: string }) {
  if (!rows.length) return <EmptyState compact icon="bar-chart" title={empty} />;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-1">
      {rows.map((r) => (
        <li key={r.key} className="relative flex min-h-[36px] items-center justify-between gap-3 overflow-hidden rounded-md px-2.5 py-1.5 text-[13px]">
          <span className="absolute inset-y-0 left-0 rounded-md bg-visitorsSoft transition-[width] duration-200" style={{ width: `${(r.value / max) * 100}%` }} aria-hidden />
          <span className="relative min-w-0 flex-1 truncate text-ink">{r.label}</span>
          {r.extra && <span className="relative hidden shrink-0 text-[12px] text-ink-3 sm:inline">{r.extra}</span>}
          <span className="tnum relative shrink-0 font-medium text-ink">{fmtNumber(r.value)}{unit ? <span className="ml-1 text-[11px] font-normal text-ink-4">{unit}</span> : null}</span>
        </li>
      ))}
    </ul>
  );
}
