import { Env } from '../types';
import { json } from '../response';
import { getBranding } from '../branding';

export async function handleBranding(_request: Request, env: Env): Promise<Response> {
  const branding = await getBranding(env);
  return json({ branding });
}
