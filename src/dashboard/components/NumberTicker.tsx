import { useEffect, useRef } from 'react';

/** Adapted from 21st.dev / Magic UI Number Ticker (dillionverma, id 1282), without framer-motion. */
export function NumberTicker({ value, delay = 0, decimalPlaces = 0, suffix = '', className = '' }: {
  value: number; delay?: number; decimalPlaces?: number; suffix?: string; className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces }).format(n) + suffix;
    if (started.current) {
      el.textContent = fmt(value);
      return;
    }
    el.textContent = fmt(value);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      started.current = true;
      return;
    }
    let start = false, raf = 0, io: IntersectionObserver | undefined;
    const run = (t0: number) => {
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / 1100);
        const eased = 1 - (1 - p) ** 3;
        el.textContent = fmt(value * eased);
        if (p < 1) raf = requestAnimationFrame(tick);
        else { el.textContent = fmt(value); started.current = true; }
      };
      raf = requestAnimationFrame(tick);
    };
    io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || start) return;
      start = true;
      io?.disconnect();
      el.textContent = fmt(0);
      window.setTimeout(() => run(performance.now()), delay * 1000);
    }, { threshold: 0.15 });
    io.observe(el);
    return () => { io?.disconnect(); cancelAnimationFrame(raf); };
  }, [value, delay, decimalPlaces, suffix]);
  return <span ref={ref} className={`tnum inline-block tabular-nums ${className}`} />;
}
