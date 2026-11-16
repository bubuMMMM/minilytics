import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from '../components/Link';

export function SectionHead({
  id, eyebrow, title, text, center = false,
}: {
  id: string; eyebrow: string; title: ReactNode; text?: string; center?: boolean;
}) {
  return (
    <div className={center ? 'mx-auto max-w-[760px] text-center' : 'max-w-[760px]'}>
      {center
        ? <div className="flex justify-center"><p className="ml-feat-badge">{eyebrow}</p></div>
        : <p className="ml-feat-badge">{eyebrow}</p>}
      <h2 id={id} className="ml-feat-title mt-5 text-[clamp(1.85rem,5vw,3rem)] font-semibold leading-[1.08] tracking-[-0.04em] text-ink [text-wrap:balance]">
        {title}
      </h2>
      {text && (
        <p className={`mt-4 max-w-[54ch] text-[15px] leading-relaxed text-ink-3 [text-wrap:pretty] sm:text-[17px] ${center ? 'mx-auto' : ''}`}>
          {text}
        </p>
      )}
    </div>
  );
}

/** Magic UI Shimmer Button (dillionverma, id 833): traveling perimeter light, no framer-motion. */
export function ShimmerLink({ href, children, className = '' }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={`ml-shimmer-btn inline-flex ${className}`}>
      <span className="relative z-[1] inline-flex items-center justify-center gap-2">{children}</span>
    </Link>
  );
}

export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.add('is-ready');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('is-in');
      return;
    }
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      el.classList.add('is-in');
      io.disconnect();
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    const t = window.setTimeout(() => el.classList.add('is-in'), 1600);
    return () => { io.disconnect(); clearTimeout(t); };
  }, []);
  return ref;
}

export function useActiveSection(ids: string[]) {
  const [active, setActive] = useState('');
  useEffect(() => {
    const vis = new Map<string, number>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) vis.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
      let best = '', ratio = 0;
      for (const id of ids) {
        const v = vis.get(id) ?? 0;
        if (v > ratio) { ratio = v; best = id; }
      }
      if (best) setActive('#' + best);
    }, { rootMargin: '-22% 0px -58% 0px', threshold: [0, 0.1, 0.25, 0.5, 1] });
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [ids.join('|')]);
  return active;
}

export function TiltStage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || reduce) return;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `rotateX(${(-y * 7).toFixed(2)}deg) rotateY(${(x * 8).toFixed(2)}deg)`;
    };
    const onLeave = () => { el.style.transform = 'rotateX(6deg) rotateY(0deg)'; };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, []);
  return (
    <div className="ml-tilt-scene">
      <div ref={ref} className="ml-tilt-card">
        {children}
      </div>
    </div>
  );
}

export const TRUST_ITEMS: { label: string; href?: string }[] = [
  { label: '≈ 7 Ko compressé' },
  { label: 'Cookies first-party uniquement' },
  { label: 'Aucune donnée revendue' },
  { label: 'Code source ouvert', href: 'https://github.com/bubuMMMM/minilytics' },
];

export const TOOL_ITEMS = [
  'HTML', 'WordPress', 'Webflow', 'Next.js', 'React', 'Vue', 'Shopify',
  'Stripe', 'Lemon Squeezy', 'Polar', 'Dodo Payments', 'Paddle',
  'GitHub', 'Cursor', 'Claude', 'ChatGPT',
];

export function TrustStrip() {
  return (
    <ul className="ml-trust" aria-label="Points clés du produit">
      {TRUST_ITEMS.map((t) => (
        <li key={t.label}>
          {t.href
            ? <a href={t.href} rel="noopener noreferrer" className="ml-trust-pill hover:border-line-strong hover:text-ink">{t.label}</a>
            : <span className="ml-trust-pill">{t.label}</span>}
        </li>
      ))}
    </ul>
  );
}

export function ToolsMarquee() {
  const items = [...TOOL_ITEMS, ...TOOL_ITEMS];
  return (
    <div className="ml-feat-marquee-mask" aria-label="Outils et plateformes compatibles">
      <ul className="ml-feat-marquee-track ml-tools-track">
        {items.map((name, i) => (
          <li key={`${name}-${i}`} className="ml-tool-chip" aria-hidden={i >= TOOL_ITEMS.length}>
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}
