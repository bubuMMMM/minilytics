import { useEffect, useState } from 'react';

/** Stable 32-bit hash (FNV-1a) so a visitor keeps the same colours everywhere. */
function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
export function initials(name?: string | null, email?: string | null): string {
  const src = (name || '').trim() || (email || '').split('@')[0].replace(/[._-]+/g, ' ').trim();
  if (!src) return '';
  const parts = src.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] ?? '')).toUpperCase();
}

async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s.trim().toLowerCase()));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Avatar of an identified visitor (minilytics('identify', { name, email })): initials on a stable
 * two-tone gradient, replaced by their Gravatar when one exists (hashed e-mail, d=blank → transparent, initials show through).
 */
export function IdentityAvatar({ seed, name, email, image, size = 32, ring = false, className = '' }: { seed: string; name?: string | null; email?: string | null; image?: string | null; size?: number; ring?: boolean; className?: string }) {
  const h = hash(seed || 'x');
  const h1 = h % 360, h2 = (h1 + 40 + ((h >> 9) % 120)) % 360;
  const a = (h >> 3) % 360;
  const ini = initials(name, email);
  const [src, setSrc] = useState<string | null>(image ?? null);
  useEffect(() => {
    if (image || !email || !/@/.test(email) || !crypto?.subtle) return;
    let alive = true;
    sha256(email).then((d) => { if (alive) setSrc(`https://www.gravatar.com/avatar/${d}?s=${size * 2}&d=blank`); }).catch(() => {});
    return () => { alive = false; };
  }, [email, image, size]);
  const style = {
    width: size, height: size, fontSize: Math.max(9, size * 0.38),
    background: `radial-gradient(circle at ${30 + (h % 40)}% ${25 + ((h >> 5) % 40)}%, hsl(${h2} 85% 72%) 0, transparent 55%), linear-gradient(${a}deg, hsl(${h1} 70% 52%), hsl(${h2} 75% 42%))`,
  };
  return (
    <span className={`relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold tracking-tight text-white ${ring ? 'ring-2 ring-surface' : ''} ${className}`} style={style} aria-hidden>
      {ini && <span className="drop-shadow-[0_1px_1px_rgba(0,0,0,.25)]">{ini}</span>}
      {src && <img src={src} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" onError={() => setSrc(null)} />}
    </span>
  );
}
