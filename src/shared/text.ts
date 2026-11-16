/**
 * Safe string helpers for ingestion and Postgres binds.
 * Neon/Postgres rejects lone UTF-16 surrogates ("unexpected end of hex escape")
 * and NUL bytes in text parameters. JS .slice() on a string cuts UTF-16 code
 * units, so slicing in the middle of an emoji produces a lone surrogate.
 */

/** Replace lone surrogates with U+FFFD (same as String.prototype.toWellFormed). */
export function toWellFormedFallback(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += s[i] + s[i + 1];
        i++;
      } else {
        out += '\uFFFD';
      }
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      out += '\uFFFD';
    } else {
      out += s[i];
    }
  }
  return out;
}

/** Well-formed Unicode text without NUL (safe to send to Postgres). */
export function toWellFormedText(s: string): string {
  const wellFormed = (s as string & { toWellFormed?: () => string }).toWellFormed;
  const well = typeof wellFormed === 'function' ? wellFormed.call(s) : toWellFormedFallback(s);
  return well.replace(/\u0000/g, '');
}

/** Coerce a bind parameter: booleans to 0/1, undefined to null, strings sanitized. */
export function sanitizeBindValue(p: unknown): unknown {
  if (typeof p === 'boolean') return p ? 1 : 0;
  if (p === undefined) return null;
  if (typeof p === 'string') return toWellFormedText(p);
  return p;
}

/** Keep at most `n` Unicode code points (does not trim). */
export function clipChars(s: string, n: number): string {
  const t = toWellFormedText(s);
  if (n <= 0) return '';
  const chars = [...t];
  return chars.length <= n ? t : chars.slice(0, n).join('');
}

/** Trim and keep at most `n` Unicode code points. Empty/non-strings become null. */
export function clip(s: unknown, n = 255): string | null {
  if (typeof s !== 'string') return null;
  const t = toWellFormedText(s).trim();
  if (!t) return null;
  return clipChars(t, n);
}
