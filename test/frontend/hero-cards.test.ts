import { describe, expect, it } from 'vitest';
import { barWidth, change, dayTick, formatFr, monogram, pct, periodDelta } from '../../src/dashboard/lib/heroCards';

const NBSP = String.fromCharCode(160);

describe('pct', () => {
  it('renders a rounded percentage with a no-break space', () => {
    expect(pct(25, 100)).toBe(`25${NBSP}%`);
  });
  it('reads « < 1 % » for a non-zero share that would round to 0', () => {
    expect(pct(1, 10_000)).toBe(`<${NBSP}1${NBSP}%`);
  });
  it('renders 0 % only when the value is actually zero', () => {
    expect(pct(0, 100)).toBe(`0${NBSP}%`);
  });
});

describe('change', () => {
  it('returns null when the previous period is too small to mean something', () => {
    expect(change(80, 10, 20)).toBeNull();
  });
  it('returns a rounded percent change when the previous period is large enough', () => {
    expect(change(120, 100, 20)).toBe(20);
    expect(change(80, 100, 20)).toBe(-20);
  });
  it('hides an absurd swing above 300 %', () => {
    expect(change(5000, 100, 20)).toBeNull();
  });
});

describe('dayTick', () => {
  it('prints the day of month from a date-only ISO string, without a leading zero', () => {
    expect(dayTick('2026-11-03')).toBe('3');
    expect(dayTick('2026-11-16')).toBe('16');
  });
  it('reads the calendar date from a timestamp without shifting the day', () => {
    expect(dayTick('2026-11-16T23:00:00.000Z')).toBe('16');
  });
  it('returns an empty tick for an unparseable value', () => {
    expect(dayTick('')).toBe('');
  });
});

describe('barWidth', () => {
  it('scales 0–100 and keeps a visible sliver for a non-zero value', () => {
    expect(barWidth(50, 100)).toBe(50);
    expect(barWidth(1, 1000)).toBe(2);
    expect(barWidth(0, 100)).toBe(0);
    expect(barWidth(10, 0)).toBe(0);
  });
});

describe('monogram', () => {
  it('uses a stable mark for known AI operators', () => {
    expect(monogram('OpenAI')).toBe('OA');
    expect(monogram('Anthropic')).toBe('AN');
    expect(monogram('ByteDance')).toBe('BD');
    expect(monogram('Common Crawl')).toBe('CC');
  });
  it('falls back to initials for an unknown name', () => {
    expect(monogram('Hello World')).toBe('HW');
    expect(monogram('Acme')).toBe('AC');
  });
});

describe('periodDelta', () => {
  it('returns a percent when the swing stays within 300 %', () => {
    expect(periodDelta(120, 100, 20)).toEqual({ kind: 'pct', value: 20 });
  });
  it('returns the raw difference when a percent would be unreadable', () => {
    expect(periodDelta(8639, 162, 20)).toEqual({ kind: 'abs', value: 8477 });
  });
  it('returns null when the previous period is too small', () => {
    expect(periodDelta(80, 10, 20)).toBeNull();
  });
});

describe('formatFr', () => {
  const NBSP = '\u00a0';
  it('groups thousands with a visible no-break space, including four-digit values', () => {
    expect(formatFr(8477)).toBe(`8${NBSP}477`);
    expect(formatFr(83318)).toBe(`83${NBSP}318`);
    expect(formatFr(89604)).toBe(`89${NBSP}604`);
  });
  it('leaves a three-digit value ungrouped and preserves a minus sign', () => {
    expect(formatFr(113)).toBe('113');
    expect(formatFr(-8477)).toBe(`−8${NBSP}477`);
  });
});
