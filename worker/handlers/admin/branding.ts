import { Env } from '../../types';
import { json, error } from '../../response';
import { requireAdmin } from '../../auth';
import {
  BrandingSettings,
  getBranding,
  mergeBranding,
  saveBranding,
} from '../../branding';

export async function handleAdminBranding(request: Request, env: Env): Promise<Response> {
  const authErr = await requireAdmin(request, env);
  if (authErr) return authErr;

  if (request.method === 'GET') {
    const branding = await getBranding(env);
    return json({ branding });
  }

  if (request.method === 'PATCH') {
    let body: Partial<BrandingSettings>;
    try {
      body = (await request.json()) as Partial<BrandingSettings>;
    } catch {
      return error('Invalid JSON body', 400);
    }

    const current = await getBranding(env);
    const next = mergeBranding(current, body);
    await saveBranding(env, next);
    return json({ branding: next });
  }

  return error('Method not allowed', 405);
}
