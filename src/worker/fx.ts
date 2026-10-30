/**
 * Currency conversion to the site currency, using the European Central Bank reference rates published
 * by Frankfurter (free, no key). Rates are cached per day in the fx_rates table (and per isolate), so a
 * webhook costs at most one HTTP call per day and base currency.
 */
import { currencyDecimals } from './payments.js';

const FX_URL = 'https://api.frankfurter.dev/v1';
const mem = new Map<string, Record<string, number>>();

export interface FxResult { amount: number; rate: number; date: string }

const dayOf = (ts: number) => new Date(ts).toISOString().slice(0, 10);

/** ECB rates for `base` on `day` (the latest published day on or before it). */
export async function ratesFor(db: D1Database, base: string, day: string, fetcher: typeof fetch = fetch): Promise<Record<string, number> | null> {
  base = base.toUpperCase();
  const key = `${day}:${base}`;
  const hit = mem.get(key);
  if (hit) return hit;
  const row = await db.prepare('SELECT rates FROM fx_rates WHERE day = ? AND base = ?').bind(day, base).first<{ rates: string }>().catch(() => null);
  if (row) {
    const r = JSON.parse(row.rates) as Record<string, number>;
    mem.set(key, r);
    return r;
  }
  const today = dayOf(Date.now());
  try {
    const res = await fetcher(`${FX_URL}/${day >= today ? 'latest' : day}?base=${encodeURIComponent(base)}`, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const j = (await res.json()) as { rates?: Record<string, number> };
    if (!j.rates || typeof j.rates !== 'object') return null;
    const rates = { ...j.rates, [base]: 1 };
    // Today's rates may still change until the ECB publishes (~16:00 CET); don't pin them for the day.
    if (day < today) {
      await db.prepare('INSERT INTO fx_rates (day, base, rates, fetched_at) VALUES (?, ?, ?, ?) ON CONFLICT (day, base) DO NOTHING')
        .bind(day, base, JSON.stringify(rates), Date.now()).run().catch(() => {});
    }
    if (mem.size > 500) mem.clear();
    mem.set(key, rates);
    return rates;
  } catch {
    return null;
  }
}

/**
 * Convert minor units of `from` into minor units of `to` at the ECB rate of the payment day.
 * Returns null when the rate is unknown (the payment is then stored in its own currency, unconverted).
 */
export async function convertMinor(db: D1Database, amount: number, from: string, to: string, ts: number, fetcher?: typeof fetch): Promise<FxResult | null> {
  from = from.toUpperCase();
  to = to.toUpperCase();
  const date = dayOf(ts);
  if (from === to) return { amount, rate: 1, date };
  const rates = await ratesFor(db, from, date, fetcher);
  const rate = rates?.[to];
  if (!rate || !Number.isFinite(rate)) return null;
  const major = amount / 10 ** currencyDecimals(from);
  return { amount: Math.round(major * rate * 10 ** currencyDecimals(to)), rate, date };
}
