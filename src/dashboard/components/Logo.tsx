export function Logo({ small = false }: { small?: boolean }) {
  const size = small ? 28 : 32;
  return (
    <span className="inline-flex items-center gap-2.5 text-[#101728]">
      <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="Minilytics" className="shrink-0">
        <rect width="40" height="40" rx="12" fill="#4e61ed" />
        <path d="M8 27.5 15 20l5.8 4.2L32 12" fill="none" stroke="#fff" strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="31.8" cy="12.2" r="3" fill="#b8f2df"/>
      </svg>
      <span className={'font-semibold tracking-[-.06em] ' + (small ? 'text-lg' : 'text-[22px]')}>minilytics<span className="text-[#5266f1]">.</span></span>
    </span>
  );
}
