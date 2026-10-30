import type { ReactNode } from 'react';
import { UiIcon } from './UiIcon';

export function SegmentedTabs<T extends string | number>({ value, options, onChange, label }: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-well p-0.5" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={value === option.value}
          className={'min-h-[36px] rounded-md px-3 text-[13px] font-medium transition-colors md:min-h-[30px] ' +
            (value === option.value ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink')}
          onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function StatusPill({ children, active = false }: { children: ReactNode; active?: boolean }) {
  return (
    <span className={'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-2.5 py-0.5 text-[12px] font-medium ' +
      (active ? 'text-ink-2' : 'text-ink-3')}>
      <span className={'h-1.5 w-1.5 rounded-full ' + (active ? 'bg-success' : 'bg-line-strong')} />
      {children}
    </span>
  );
}

export function MetricTile({ label, value, caption, icon, number, focus = false, series }: {
  label: string;
  value: string;
  caption: string;
  icon: 'users' | 'eye' | 'layers' | 'clock';
  number: string;
  focus?: boolean;
  series?: number[];
}) {
  const max = Math.max(1, ...(series || []));
  return (
    <article className="ml-bento flex min-w-0 flex-col p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-[12px] font-medium text-ink-3">{label}</span>
        <span className="shrink-0 text-ink-4" data-n={number} data-focus={focus || undefined}><UiIcon name={icon} size={15}/></span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="min-w-0 truncate text-2xl font-semibold leading-tight tracking-tight tabular-nums text-ink">{value}</div>
        {series && series.length > 1 &&
          <div className="flex h-[28px] w-[72px] shrink-0 items-end gap-[2px] sm:w-[96px]" aria-hidden="true">
            {series.slice(-12).map((n,i) =>
              <span key={i} className="min-w-[2px] flex-1 rounded-t-[2px] bg-accent/70" style={{height: Math.max(4, n / max * 100) + '%'}} />)}
          </div>}
      </div>
      <div className="mt-1 truncate text-[12px] text-ink-4">{caption}</div>
    </article>
  );
}
