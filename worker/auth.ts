import { Env } from './types';
import { error } from './response';

export function requireAdmin(request: Request, env: Env): Response | null {
  const auth = request.headers.get('Authorization');
  if (!auth || auth !== `Bearer ${env.ADMIN_API_TOKEN}`) {
    return error('Unauthorized', 401);
  }
  return null;
}

export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
