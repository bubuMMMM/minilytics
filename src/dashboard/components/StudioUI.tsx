import type { ReactNode } from 'react';
import { UiIcon } from './UiIcon';

export function SegmentedTabs<T extends string | number>({ value, options, onChange, label }: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-[#e6ebf4] bg-[#f6f8fc] p-1" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={value === option.value}
          className={'rounded-[9px] px-3.5 py-2 text-[12px] font-semibold transition-all duration-200 sm:px-4 ' +
            (value === option.value ? 'bg-white text-[#4158e3] shadow-[0_1px_5px_rgba(25,47,110,.12)]' : 'text-[#7a869d] hover:text-[#334155]')}
          onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function StatusPill({ children, active = false }: { children: ReactNode; active?: boolean }) {
  return (
    <span className={'inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-[11px] font-semibold ' +
      (active ? 'border-[#daf2e6] bg-[#f1fbf6] text-[#17855e]' : 'border-[#e9edf5] bg-[#f8faff] text-[#71809a]')}>
      <span className={active ? 'ml-dot-live' : 'h-1.5 w-1.5 rounded-full bg-[#a2b0c8]'} />
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
    <article className={'ml-bento ml-bento-interactive group relative flex min-h-[160px] min-w-0 flex-col overflow-hidden p-5 sm:min-h-[182px] sm:p-6 ' +
      (focus ? 'border-[#dbe2ff] bg-[#fcfdff]' : '')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><div className="text-[12px] font-semibold text-[#77849b]">{label}</div></div>
        <div className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ' + (focus ? 'bg-[#edf0ff] text-[#5266ef]' : 'bg-[#f5f7fb] text-[#71809c]')}>
          <UiIcon name={icon} size={18}/>
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div className="min-w-0 truncate text-[clamp(1.7rem,3vw,2.65rem)] font-semibold leading-none tracking-[-.063em] tabular-nums text-[#111b33]">{value}</div>
        {series && series.length > 1 &&
          <div className="flex h-[38px] w-[80px] shrink-0 items-end gap-[3px] sm:w-[105px]" aria-hidden="true">
            {series.slice(-12).map((n,i) =>
              <span key={i} className={'min-w-[2px] flex-1 rounded-t-[3px] ' + (focus ? 'bg-[#a5b3ff]' : 'bg-[#cfdaef]')}
                style={{height: Math.max(3, n / max * 100) + '%'}} />)}
          </div>}
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-[#edf0f6] pt-3.5 text-[11px] text-[#9aa5b7]">
        <span className="truncate">{caption}</span><span className="font-mono text-[#b1bed4]">{number}</span>
      </div>
    </article>
  );
}
