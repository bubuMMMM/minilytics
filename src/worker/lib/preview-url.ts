import { belongsTo, normalizePath } from '../collect.js';

const VIEWPORTS = { desktop: 1440, mobile: 390 } as const;
export type PreviewViewport = keyof typeof VIEWPORTS;
export const PREVIEW_WIDTH: Record<PreviewViewport, number> = VIEWPORTS;
export const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;

export function parseViewport(raw: string | undefined | null): PreviewViewport {
  return raw === 'mobile' ? 'mobile' : 'desktop';
}

/**
 * Build the only URL we are allowed to screenshot: https://{site domain}{path}.
 * Rejects protocol-relative paths, other hosts, and non-https URLs.
 */
export function previewTargetUrl(domain: string, path: string): string | null {
  const raw = (path || '/').trim() || '/';
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  const pathname = normalizePath(raw.split(/[?#]/)[0] || '/');
  let url: URL;
  try {
    url = new URL(pathname, `https://${domain.replace(/^https?:\/\//, '')}/`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (!belongsTo(url.hostname, domain)) return null;
  const p = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '') || '/';
  return `https://${url.hostname}${p}`;
}

export function previewCachePath(path: string): string | null {
  const raw = (path || '/').trim() || '/';
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  return normalizePath(raw.split(/[?#]/)[0] || '/') || '/';
}
