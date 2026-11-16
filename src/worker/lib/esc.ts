const HTML: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape text for safe interpolation into HTML. */
export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => HTML[ch] ?? ch);
}
