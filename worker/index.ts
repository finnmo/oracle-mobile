import { Env } from './types';
import { cors, error } from './response';
import { handleStatus } from './handlers/status';
import { handleRatings } from './handlers/ratings';
import { handlePubs } from './handlers/pubs';
import { handleRounds } from './handlers/rounds';
import { handleAdminAnnounce } from './handlers/admin/announce';
import { handleAdminOpenRatings } from './handlers/admin/open-ratings';
import { handleAdminCloseRatings } from './handlers/admin/close-ratings';
import { handleAdminPubs } from './handlers/admin/pubs';
import { handleAdminReset } from './handlers/admin/reset';
import { handleStats } from './handlers/stats';
import { handleCron } from './cron/friday';

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const { method } = request;
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (method === 'OPTIONS') return cors();

    // API routing
    if (path.startsWith('/api/')) {
      try {
        if (path === '/api/status'               && method === 'GET')  return handleStatus(request, env);
        if (path === '/api/pubs'                 && method === 'GET')  return handlePubs(request, env);
        if (path === '/api/rounds'               && method === 'GET')  return handleRounds(request, env);
        if (path === '/api/stats'                && method === 'GET')  return handleStats(request, env);
        if (path === '/api/ratings'              && method === 'POST') return handleRatings(request, env);
        if (path === '/api/admin/announce'       && method === 'POST') return handleAdminAnnounce(request, env);
        if (path === '/api/admin/open-ratings'   && method === 'POST') return handleAdminOpenRatings(request, env);
        if (path === '/api/admin/close-ratings'  && method === 'POST') return handleAdminCloseRatings(request, env);
        if (path === '/api/admin/reset'          && method === 'POST') return handleAdminReset(request, env);
        if (path.startsWith('/api/admin/pubs'))                        return handleAdminPubs(request, env);

        return error('Not found', 404);
      } catch (err) {
        console.error('Unhandled API error:', err);
        return error('Internal server error', 500);
      }
    }

    // Serve static frontend assets
    return env.ASSETS.fetch(request);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleCron(event, env));
  },
};
