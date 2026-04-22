const TTL_SECONDS = 60 * 60 * 24 * 30;

async function getKey(): Promise<CryptoKey> {
  const secret = process.env.APP_SESSION_SECRET;
  if (!secret) throw new Error('APP_SESSION_SECRET is not set');
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function fromBase64Url(str: string): Uint8Array<ArrayBuffer> {
  const buf = Buffer.from(str, 'base64url');
  const out = new Uint8Array(new ArrayBuffer(buf.length));
  out.set(buf);
  return out;
}

export async function createSession(): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = new TextEncoder().encode(String(exp));
  const key = await getKey();
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, payload));
  return `${toBase64Url(payload)}.${toBase64Url(sig)}`;
}

export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [payloadB64, sigB64] = token.split('.');
  if (!payloadB64 || !sigB64) return false;
  try {
    const payload = fromBase64Url(payloadB64);
    const sig = fromBase64Url(sigB64);
    const key = await getKey();
    const valid = await crypto.subtle.verify('HMAC', key, sig, payload);
    if (!valid) return false;
    const exp = parseInt(new TextDecoder().decode(payload), 10);
    if (!exp || exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}

export const SESSION_MAX_AGE = TTL_SECONDS;
