import { Env } from '../types';
import { json } from '../response';

export async function handlePubs(_req: Request, env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    'SELECT id, name, address, mapsUrl FROM pubs WHERE active = 1 ORDER BY name'
  ).all<{ id: string; name: string; address: string | null; mapsUrl: string | null }>();

  return json({ pubs: result.results });
}
