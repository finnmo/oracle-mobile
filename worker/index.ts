import { Env } from './types';
import { corsPreflight, withCors } from './cors';
import { error } from './response';
import { handleStatus } from './handlers/status';
import { handleRatings } from './handlers/ratings';
import { handlePubs } from './handlers/pubs';
import { handleRounds } from './handlers/rounds';
import { handleVotes } from './handlers/votes';
import { handleVetoes } from './handlers/vetoes';
import { handleAdminAnnounce } from './handlers/admin/announce';
import { handleAdminOpenRatings } from './handlers/admin/open-ratings';
import { handleAdminCloseRatings } from './handlers/admin/close-ratings';
import { handleAdminPubs } from './handlers/admin/pubs';
import { handleAdminReset } from './handlers/admin/reset';
import { handleStats } from './handlers/stats';
import { handlePubComments } from './handlers/pub-comments';
import { handleEvents } from './handlers/events';
import { handleBranding } from './handlers/branding';
import { handleAdminBranding } from './handlers/admin/branding';
import { handleAdminLogin, handleAdminLogout } from './handlers/admin/login';
import { serveAdminShell } from './adminShell';
import { handleCron } from './cron/friday';

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const { method } = request;
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (method === 'OPTIONS') return corsPreflight(env);

    // API routing
    if (path.startsWith('/api/')) {
      try {
        if (path === '/api/status'               && method === 'GET')  return withCors(await handleStatus(request, env), env);
        if (path === '/api/events'               && method === 'GET')  return withCors(await handleEvents(request, env), env);
        if (path === '/api/pubs'                 && method === 'GET')  return withCors(await handlePubs(request, env), env);
        if (path === '/api/rounds'               && method === 'GET')  return withCors(await handleRounds(request, env), env);
        if (path === '/api/stats'                && method === 'GET')  return withCors(await handleStats(request, env), env);
        if (path === '/api/branding'             && method === 'GET')  return withCors(await handleBranding(request, env), env);
        if (path.match(/^\/api\/pubs\/[^/]+\/comments$/) && method === 'GET')
          return withCors(await handlePubComments(request, env), env);
        if (path === '/api/votes') {
          const res = await handleVotes(request, env);
          return withCors(res, env);
        }
        if (path === '/api/vetoes'               && method === 'POST') return withCors(await handleVetoes(request, env), env);
        if (path === '/api/ratings'              && method === 'POST') return withCors(await handleRatings(request, env), env);
        if (path === '/api/admin/login'          && method === 'POST') return withCors(await handleAdminLogin(request, env), env);
        if (path === '/api/admin/logout'         && method === 'POST') return withCors(await handleAdminLogout(request, env), env);
        if (path === '/api/admin/announce'       && method === 'POST') return withCors(await handleAdminAnnounce(request, env), env);
        if (path === '/api/admin/open-ratings'   && method === 'POST') return withCors(await handleAdminOpenRatings(request, env), env);
        if (path === '/api/admin/close-ratings'  && method === 'POST') return withCors(await handleAdminCloseRatings(request, env), env);
        if (path === '/api/admin/reset'          && method === 'POST') return withCors(await handleAdminReset(request, env), env);
        if (path.startsWith('/api/admin/pubs'))                        return withCors(await handleAdminPubs(request, env), env);
        if (path === '/api/admin/branding')                            return withCors(await handleAdminBranding(request, env), env);

        return withCors(error('Not found', 404), env);
      } catch (err) {
        console.error('Unhandled API error:', err);
        return withCors(error('Internal server error', 500), env);
      }
    }

    // Serve SPA shell for /admin without redirecting the browser to / or /index.html
    // (a Location redirect would make "Admin" look like a home-page refresh).
    if ((path === '/admin' || path.startsWith('/admin/')) && (method === 'GET' || method === 'HEAD')) {
      return serveAdminShell(request, url, env.ASSETS);
    }

    // Serve static frontend assets
    return env.ASSETS.fetch(request);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleCron(event, env));
  },
};
