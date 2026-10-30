/**
 * Shared building blocks (design v3). Every view composes these instead of ad-hoc markup, so headers,
 * cards, badges, empty states and segmented controls look and behave the same everywhere.
 */
import type { ReactNode } from 'react';
import { UiIcon, type UiIconName } from './UiIcon';

/** Page title block: title, one-line description, meta chips, actions (wrap under on phones). */
export function PageHeader({ title, description, meta, actions, kicker, translateTitle = true }: {
  title: ReactNode; description?: ReactNode; meta?: ReactNode; actions?: ReactNode; kicker?: ReactNode; translateTitle?: boolean;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 lg:mb-8 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {kicker && <div className="mb-1.5 text-[12px] font-medium text-ink-3">{kicker}</div>}
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[26px]" translate={translateTitle ? undefined : 'no'}>{title}</h1>
        {(description || meta) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] text-ink-3">
            {description && <span className="text-pretty">{description}</span>}
            {meta}
          </div>
        )}
      </div>
      {actions && <div className="flex min-w-0 flex-wrap items-center gap-2 lg:shrink-0 lg:flex-nowrap">{actions}</div>}
    </div>
  );
}

/** Heading for a block inside a page (replaces the kicker + h2 + paragraph trio). */
export function SectionHeader({ id, kicker, title, description, action }: { id?: string; kicker?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {kicker && <div className="mb-1 text-[12px] font-medium text-ink-3">{kicker}</div>}
        <h2 id={id} className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-pretty text-[13px] leading-relaxed text-ink-3">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = '', as: As = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' } & Record<string, unknown>) {
  return <As className={`ml-bento min-w-0 ${className}`} {...rest}>{children}</As>;
}

export function CardHeader({ title, description, action, className = '' }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-start justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
        {description && <p className="mt-0.5 text-[12px] leading-relaxed text-ink-3">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

const TONES = {
  neutral: 'border-line bg-well text-ink-2',
  accent: 'border-accent/25 bg-accent/10 text-accent',
  success: 'border-success/25 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  danger: 'border-danger/25 bg-danger/10 text-danger',
} as const;
export type Tone = keyof typeof TONES;
/** Small status label, sentence case (never uppercase). */
export function Badge({ tone = 'neutral', children, className = '', dot = false }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={`inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[11px] font-medium leading-none ${TONES[tone]} ${className}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

/** One empty state: icon, title, one sentence, optional action. */
export function EmptyState({ icon = 'bar-chart', title, description, action, compact = false }: { icon?: UiIconName; title: ReactNode; description?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'px-4 py-6' : 'px-6 py-10'}`}>
      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-well text-ink-3" aria-hidden><UiIcon name={icon} size={17} /></span>
      <p className="mt-3 text-[13px] font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-pretty text-[12px] leading-relaxed text-ink-3">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return <span className={`ml-skeleton block ${className}`} aria-hidden />;
}

/** Segmented control (radio group). */
export function Segmented<T extends string>({ options, value, onChange, label, size = 'md' }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; label: string; size?: 'sm' | 'md' }) {
  return (
    <div className="inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-well p-0.5" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`whitespace-nowrap rounded-md px-2.5 font-medium transition-colors duration-150 ${size === 'sm' ? 'min-h-[28px] text-[12px]' : 'min-h-[36px] text-[13px] md:min-h-[30px]'} ${value === o.value ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Underline tabs (for in-card dimension switches). */
export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="ml-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)} className="ml-tab">{t.label}</button>
      ))}
    </div>
  );
}
