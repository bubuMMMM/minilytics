const enc = new TextEncoder();

export function randomId(bytes = 12): string {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, bytes * 2);
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: ArrayBuffer): string {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
}

async function hmac(key: Uint8Array<ArrayBuffer>, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(data));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/**
 * Verify a Standard Webhooks signature (used by Dodo Payments).
 * Signed content is `${id}.${timestamp}.${body}`, HMAC-SHA256 with the base64 secret after `whsec_`.
 */
export async function verifyStandardWebhook(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  now = Date.now(),
): Promise<boolean> {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 5 * 60) return false;
  let key: Uint8Array<ArrayBuffer>;
  try {
    key = b64ToBytes(secret.startsWith('whsec_') ? secret.slice(6) : secret);
  } catch {
    return false;
  }
  const expected = bytesToB64(await hmac(key, `${id}.${timestamp}.${body}`));
  return signature
    .split(' ')
    .map((s) => s.split(',')[1] ?? '')
    .some((sig) => safeEqual(sig, expected));
}

/** Sign a value for the dashboard login cookie. */
export async function signToken(secret: string, value: string): Promise<string> {
  // Use an ArrayBuffer-backed copy for the WebCrypto BufferSource type on TS 5.9+.
  const encoded = enc.encode(secret);
  const key = new Uint8Array(encoded.byteLength);
  key.set(encoded);
  const sig = bytesToB64(await hmac(key, value)).replace(/=+$/, '');
  return `${value}.${sig}`;
}

export async function verifyToken(secret: string, token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const i = token.lastIndexOf('.');
  if (i < 0) return null;
  const value = token.slice(0, i);
  const expected = await signToken(secret, value);
  return safeEqual(expected, token) ? value : null;
}

/** Constant-time password check that also hides the expected password's length (compares SHA-256 digests). */
export async function passwordsMatch(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([a, b].map((x) => crypto.subtle.digest('SHA-256', enc.encode(x))));
  return safeEqual(bytesToB64(da), bytesToB64(db));
}

/** Hex HMAC-SHA256 with a UTF-8 key (Stripe, Lemon Squeezy webhook signatures). */
export async function hmacHex(secret: string, data: string): Promise<string> {
  const encoded = enc.encode(secret);
  const key = new Uint8Array(encoded.byteLength);
  key.set(encoded);
  return Array.from(new Uint8Array(await hmac(key, data)), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function constantTimeEqual(a: string, b: string): boolean {
  return safeEqual(a, b);
}

/** Stripe-Signature: `t=<unix>,v1=<hex>[,v1=…]`, signed payload `${t}.${body}`, 5 min tolerance. */
export async function verifyStripeSignature(secret: string, header: string | null, body: string, now = Date.now()): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v ?? '');
  if (!t || !sigs.length || !Number.isFinite(Number(t)) || Math.abs(now / 1000 - Number(t)) > 5 * 60) return false;
  const expected = await hmacHex(secret, `${t}.${body}`);
  return sigs.some((s) => safeEqual(s, expected));
}
