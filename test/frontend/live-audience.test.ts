import { describe, expect, it } from 'vitest';
import { liveAudience, liveAudienceSuffix } from '../../src/dashboard/lib/liveAudience';

describe('liveAudience', () => {
  it('prefers the live count when someone is online', () => {
    expect(liveAudience(1, 52, false)).toEqual({ kind: 'online', count: 1 });
    expect(liveAudienceSuffix('online', 1)).toBe('visiteur en ligne');
    expect(liveAudienceSuffix('online', 2)).toBe('visiteurs en ligne');
  });
  it('falls back to the 24 h count when nobody is online', () => {
    expect(liveAudience(0, 52, false)).toEqual({ kind: 'today', count: 52 });
    expect(liveAudienceSuffix('today', 52)).toBe('visiteurs aujourd’hui');
    expect(liveAudienceSuffix('today', 1)).toBe('visiteur aujourd’hui');
  });
  it('hides the pill when both counts are zero', () => {
    expect(liveAudience(0, 0, false)).toEqual({ kind: 'hidden' });
  });
  it('shows a loading state only before any number arrives', () => {
    expect(liveAudience(null, null, false)).toEqual({ kind: 'loading' });
  });
  it('uses a quiet fallback when the request failed', () => {
    expect(liveAudience(null, null, true)).toEqual({ kind: 'fallback' });
  });
});
