export function Logo({ small = false }: { small?: boolean }) {
  const size = small ? 27 : 32;
  return (
    <span className="inline-flex items-center gap-2.5 text-[#27231f]">
      <svg width={size} height={size} viewBox="0 0 38 38" role="img" aria-label="Logo Minilytics" className="shrink-0">
        <rect width="38" height="38" rx="12" fill="#25221f" />
        <path d="M8 26V17M15 26V20M22 26V12M29 26V17" stroke="#716965" strokeWidth="2.2" strokeLinecap="round"/>
        <path d="m8.5 20.7 7-6 6 3 8-9" fill="none" stroke="#f3a083" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="29.5" cy="8.7" r="2.3" fill="#f3a083"/>
      </svg>
      <span className={'font-semibold tracking-[-.055em] ' + (small ? 'text-lg' : 'text-[21px]')}>minilytics<span className="text-[#df795c]">.</span></span>
    </span>
  );
}
