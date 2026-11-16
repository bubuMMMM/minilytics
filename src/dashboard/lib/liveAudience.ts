/** What the landing live pill should show when nobody is online. */
export type LiveAudience =
  | { kind: 'loading' }
  | { kind: 'hidden' }
  | { kind: 'fallback' }
  | { kind: 'online'; count: number }
  | { kind: 'today'; count: number };

export function liveAudience(online: number | null, today: number | null, failed: boolean): LiveAudience {
  if (online !== null && online > 0) return { kind: 'online', count: online };
  if (today !== null && today > 0) return { kind: 'today', count: today };
  if (failed) return { kind: 'fallback' };
  if (online === null && today === null) return { kind: 'loading' };
  return { kind: 'hidden' };
}

export function liveAudienceSuffix(kind: 'online' | 'today', count: number): string {
  const noun = count > 1 ? 'visiteurs' : 'visiteur';
  return kind === 'online' ? `${noun} en ligne` : `${noun} aujourd’hui`;
}
