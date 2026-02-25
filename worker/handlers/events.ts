import { Env } from '../types';
import { buildStatus } from './status';

// SSE endpoint — streams status updates to the client in real-time.
// Polls D1 every 5s for up to 25s, then closes (client auto-reconnects via EventSource).
// Stays well within Cloudflare Workers' 30-second request duration limit.
export async function handleEvents(_req: Request, env: Env): Promise<Response> {
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  (async () => {
    let lastKey = '';
    try {
      for (let i = 0; i < 5; i++) {
        const status = await buildStatus(env);
        const key = `${status.state}:${(status.round as { id?: string }).id ?? ''}:${(status.round as { pub?: { id?: string } }).pub?.id ?? ''}`;

        if (key !== lastKey) {
          lastKey = key;
          await writer.write(encoder.encode(`data: ${JSON.stringify(status)}\n\n`));
        } else {
          // Keep connection alive between polls
          await writer.write(encoder.encode(`: ping\n\n`));
        }

        if (i < 4) await new Promise(r => setTimeout(r, 5000));
      }
    } catch (e) {
      console.error('SSE error:', e);
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
