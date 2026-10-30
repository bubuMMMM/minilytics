export function Logo({ small = false }: { small?: boolean }) {
  const size = small ? 22 : 24;
  return (
    <span className="inline-flex items-center gap-2 text-ink" translate="no">
      <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Minilytics" className="shrink-0">
        <rect width="24" height="24" rx="6" fill="rgb(var(--ink))" />
        <path d="M6 15.5 9.6 11l2.8 2.6L18 7.5" fill="none" stroke="rgb(var(--canvas))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={'font-semibold tracking-[-0.02em] ' + (small ? 'text-[15px]' : 'text-[16px]')}>Minilytics</span>
    </span>
  );
}
