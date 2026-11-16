import { describe, expect, it } from 'vitest';
import { fmtAgo, fmtDuration, fmtNumber, fmtPct } from '../../src/dashboard/lib/format';

describe('fmtNumber', () => {
  it('formats thousands with a narrow no-break space (fr-FR)', () => {
    const s = fmtNumber(1234);
    expect(s.replace(/\s/g, ' ')).toBe('1 234');
  });
  it('uses compact notation from 10 000', () => {
    const s = fmtNumber(12_000);
    expect(s.replace(/\s/g, ' ').toLowerCase()).toMatch(/12/);
    expect(s.toLowerCase()).toMatch(/k/);
  });
});

describe('fmtPct', () => {
  it('renders a French percent', () => {
    expect(fmtPct(0.25)).toBe('25 %');
    expect(fmtPct(0.002, 0)).toBe('0,20 %');
  });
});

describe('fmtDuration', () => {
  it('uses seconds under a minute and minutes after', () => {
    expect(fmtDuration(4_000)).toBe('4 s');
    expect(fmtDuration(65_000)).toBe('1 min 05 s');
  });
});

describe('fmtAgo', () => {
  it('describes a short elapsed time in French', () => {
    expect(fmtAgo(10_000)).toBe('quelques secondes');
    expect(fmtAgo(60_000)).toBe('1 minute');
    expect(fmtAgo(120_000)).toBe('2 minutes');
  });
});
