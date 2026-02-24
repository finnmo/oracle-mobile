import { Env } from './types';
import { error } from './response';

export async function requireAdmin(request: Request, env: Env): Promise<Response | null> {
  const auth = request.headers.get('Authorization') ?? '';
  const expected = `Bearer ${env.ADMIN_API_TOKEN ?? ''}`;

  // Constant-time comparison to prevent timing attacks
  const a = new TextEncoder().encode(auth);
  const b = new TextEncoder().encode(expected);
  const len = Math.max(a.length, b.length);
  const pa = new Uint8Array(len); pa.set(a);
  const pb = new Uint8Array(len); pb.set(b);

  let diff = a.length !== b.length ? 1 : 0;
  for (let i = 0; i < len; i++) diff |= pa[i] ^ pb[i];

  if (diff !== 0) return error('Unauthorized', 401);
  return null;
}

export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
