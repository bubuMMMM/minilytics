import { describe, expect, it, beforeAll } from 'vitest';
import { clip, clipChars, sanitizeBindValue, toWellFormedFallback, toWellFormedText } from '../src/shared/text';
import { normalizePath } from '../src/worker/collect';
import { makeDb, type PgliteD1 } from './helpers/pglite-d1';

describe('clip by code points', () => {
  it('keeps a full emoji that JS string.slice would split', () => {
    const thumbs = '👍'; // one code point, two UTF-16 units
    expect(thumbs.length).toBe(2);
    expect(thumbs.slice(0, 1).charCodeAt(0)).toBeGreaterThanOrEqual(0xd800);
    expect(clip(thumbs, 1)).toBe(thumbs);
    expect(clipChars(thumbs + 'abc', 1)).toBe(thumbs);
    expect(clip('hi👍', 2)).toBe('hi');
  });

  it('trims and returns null for empty or non-strings', () => {
    expect(clip('  ')).toBeNull();
    expect(clip(null)).toBeNull();
    expect(clip(1)).toBeNull();
    expect(clip('  ok  ', 2)).toBe('ok');
  });
});

describe('lone surrogates and NUL', () => {
  const loneHigh = '\uD83D'; // high surrogate without a low one
  const loneLow = '\uDE00';
  const withNul = 'ok\u0000secret';

  it('toWellFormedText / fallback replace lone surrogates and strip NUL', () => {
    expect(toWellFormedText(loneHigh)).toBe('\uFFFD');
    expect(toWellFormedFallback(loneHigh)).toBe('\uFFFD');
    expect(toWellFormedText(loneLow)).toBe('\uFFFD');
    expect(toWellFormedText('👍')).toBe('👍');
    expect(toWellFormedText(withNul)).toBe('oksecret');
    expect(toWellFormedText('a\u0000b\uD83D')).toBe('ab\uFFFD');
  });

  it('sanitizeBindValue prepares values for Postgres', () => {
    expect(sanitizeBindValue(loneHigh)).toBe('\uFFFD');
    expect(sanitizeBindValue(withNul)).toBe('oksecret');
    expect(sanitizeBindValue(true)).toBe(1);
    expect(sanitizeBindValue(false)).toBe(0);
    expect(sanitizeBindValue(undefined)).toBeNull();
    expect(sanitizeBindValue(12)).toBe(12);
  });
});

describe('normalizePath', () => {
  it('clips by code points so a trailing emoji is not split', () => {
    const long = '/' + 'a'.repeat(498) + '👍';
    const out = normalizePath(long);
    expect(out.endsWith('👍') || out.endsWith('a')).toBe(true);
    expect([...out].length).toBeLessThanOrEqual(500);
    expect(out).toBe(clipChars(long, 500));
  });
});

describe('Stmt.bind sanitizes before Postgres', () => {
  let db: PgliteD1;
  beforeAll(async () => {
    db = await makeDb();
  }, 60_000);

  it('inserts emoji, lone surrogates and NUL without error', async () => {
    await db.prepare('INSERT INTO sites (id, name, domain, timezone, currency, api_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(
      'site_sanitize',
      '👍 Café',
      'sanitize.example',
      'UTC',
      'EUR',
      'ml_' + 'b'.repeat(32),
      1,
    ).run();
    await db.prepare('INSERT INTO visitors (site_id, id, first_seen, name) VALUES (?, ?, ?, ?)').bind(
      'site_sanitize',
      'visitor01',
      1,
      'hi\u0000\uD83D',
    ).run();
    const row = await db.prepare('SELECT name FROM visitors WHERE site_id = ? AND id = ?').bind('site_sanitize', 'visitor01').first<{ name: string }>();
    expect(row?.name).toBe('hi\uFFFD');
  });
});
