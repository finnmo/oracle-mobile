import { AdminPub, BrandingSettings, PubReviewsResponse, StatsResponse, StatusResponse, VotesResponse, HistoryRound } from './types';

const BASE = '/api';

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchStatus(): Promise<StatusResponse> {
  const deviceId = getOrCreateDeviceId();
  const res = await fetch(`${BASE}/status?deviceId=${encodeURIComponent(deviceId)}`);
  if (!res.ok) throw new Error('Could not connect — please try again');
  return res.json() as Promise<StatusResponse>;
}

export async function fetchHistory(): Promise<HistoryRound[]> {
  const res = await fetch(`${BASE}/rounds`);
  if (!res.ok) throw new Error('Could not load history');
  const data = (await res.json()) as { rounds: HistoryRound[] };
  return data.rounds;
}

export async function submitRating(
  roundId: string,
  score: number,
  comment: string,
  deviceId: string
): Promise<{ average: number; count: number }> {
  const res = await fetch(`${BASE}/ratings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roundId, score, comment: comment || undefined, deviceId }),
  });

  const data = (await res.json()) as { error?: string; ratings?: { average: number; count: number } };

  if (!res.ok) {
    throw new Error(data.error ?? 'Could not submit rating — please try again');
  }

  return data.ratings!;
}

export async function fetchStats(): Promise<StatsResponse> {
  const res = await fetch(`${BASE}/stats`);
  if (!res.ok) throw new Error('Could not load stats');
  return res.json() as Promise<StatsResponse>;
}

export async function fetchBranding(): Promise<BrandingSettings> {
  const res = await fetch(`${BASE}/branding`);
  if (!res.ok) throw new Error('Could not load branding');
  const data = (await res.json()) as { branding: BrandingSettings };
  return data.branding;
}

export async function fetchPubReviews(pubId: string): Promise<PubReviewsResponse> {
  const res = await fetch(`${BASE}/pubs/${encodeURIComponent(pubId)}/comments`);
  if (!res.ok) throw new Error('Could not load reviews');
  return res.json() as Promise<PubReviewsResponse>;
}

export function getOrCreateDeviceId(): string {
  const key = 'oracle_device_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

// ── Votes / vetoes ────────────────────────────────────────────────────────────

export async function fetchVotes(deviceId: string): Promise<VotesResponse> {
  const res = await fetch(`${BASE}/votes?deviceId=${encodeURIComponent(deviceId)}`);
  if (!res.ok) throw new Error('Could not load votes');
  return res.json() as Promise<VotesResponse>;
}

export async function castVote(pubId: string, deviceId: string): Promise<void> {
  const res = await fetch(`${BASE}/votes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pubId, deviceId }),
  });
  const data = await res.json() as { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Could not cast vote — please try again');
}

/** Remove this device’s vote for the current week (only your deviceId can do this). */
export async function clearVote(deviceId: string): Promise<void> {
  const res = await fetch(`${BASE}/votes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, clear: true }),
  });
  const data = await res.json() as { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Could not remove vote — please try again');
}

export async function castVeto(pubId: string, deviceId: string): Promise<void> {
  const res = await fetch(`${BASE}/vetoes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pubId, deviceId }),
  });
  const data = await res.json() as { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Could not submit veto — please try again');
}

// ── Admin API ─────────────────────────────────────────────────────────────────

export function getAdminToken(): string | null {
  return sessionStorage.getItem('oracle_admin_token');
}
export function setAdminToken(token: string): void {
  sessionStorage.setItem('oracle_admin_token', token);
}
export function clearAdminToken(): void {
  sessionStorage.removeItem('oracle_admin_token');
}

function getAccessJwt(): string | null {
  return sessionStorage.getItem('oracle_access_jwt');
}

export function clearAccessJwt(): void {
  sessionStorage.removeItem('oracle_access_jwt');
}

/** Bypasses Cloudflare Access when /api/admin is still gated there. */
const WORKERS_DEV_ADMIN = 'https://oracle.example-account.workers.dev/api/admin';

async function parseAdminResponse(res: Response, hadToken: boolean): Promise<{ res: Response; data: unknown }> {
  if (res.status >= 300 && res.status < 400) {
    throw new Error(
      'Admin sign-in required — open /admin and sign in with Google. ' +
      'If you use an API token, remove /api/admin from Cloudflare Access (protect /admin only).'
    );
  }

  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    if (text.includes('cloudflareaccess') || text.includes('Sign in') || text.includes('302 Found')) {
      throw new Error(
        'Cloudflare Access blocked the admin API — protect only /admin (not /api/admin), then retry.'
      );
    }
    const snippet = text.replace(/\s+/g, ' ').slice(0, 80);
    throw new Error(`Admin API returned non-JSON (${res.status})${snippet ? `: ${snippet}` : ''}`);
  }

  if (res.status === 401 || res.status === 403) {
    if (hadToken) clearAdminToken();
    throw new Error(
      'Unauthorized — open /admin and sign in with Google, or use a valid API token below.'
    );
  }
  if (!res.ok) throw new Error((data as Record<string, string>).error ?? 'Request failed');
  return { res, data };
}

async function adminFetch(path: string, options: RequestInit = {}): Promise<{ res: Response; data: unknown }> {
  const apiToken = (getAdminToken() ?? '').replace(/[^\x20-\x7E]/g, '');
  const accessJwt = getAccessJwt();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (apiToken) {
    headers.Authorization = `Bearer ${apiToken}`;
  } else if (accessJwt) {
    headers['Cf-Access-Jwt-Assertion'] = accessJwt;
  }

  const fetchOpts: RequestInit = {
    ...options,
    redirect: 'manual',
    headers,
  };

  const onCustomDomain =
    typeof window !== 'undefined' && window.location.hostname === 'picker.example.com';

  try {
    const res = await fetch(`/api/admin${path}`, {
      ...fetchOpts,
      credentials: 'include',
    });

    // Access returns 302 before the Worker can read Bearer — fall back to workers.dev with API token only.
    if (res.status >= 300 && res.status < 400 && apiToken && onCustomDomain) {
      const remote = await fetch(`${WORKERS_DEV_ADMIN}${path}`, {
        ...fetchOpts,
        credentials: 'omit',
      });
      return parseAdminResponse(remote, Boolean(apiToken));
    }

    return parseAdminResponse(res, Boolean(apiToken));
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error('Could not reach admin API — check your connection and try again');
    }
    throw err;
  }
}

export async function adminAnnounce(body: { pubName?: string; pubId?: string; force?: boolean } = {}): Promise<unknown> {
  const { data } = await adminFetch('/announce', { method: 'POST', body: JSON.stringify(body) });
  return data;
}

export async function adminReset(): Promise<unknown> {
  const { data } = await adminFetch('/reset', { method: 'POST', body: '{}' });
  return data;
}

export async function adminOpenRatings(): Promise<unknown> {
  const { data } = await adminFetch('/open-ratings', { method: 'POST', body: '{}' });
  return data;
}

export async function adminCloseRatings(): Promise<unknown> {
  const { data } = await adminFetch('/close-ratings', { method: 'POST', body: '{}' });
  return data;
}

export async function adminListPubs(): Promise<AdminPub[]> {
  const { data } = await adminFetch('/pubs', { method: 'GET' });
  return (data as { pubs: AdminPub[] }).pubs;
}

export async function adminAddPub(name: string, address?: string, mapsUrl?: string): Promise<AdminPub> {
  const { data } = await adminFetch('/pubs', {
    method: 'POST',
    body: JSON.stringify({ name, address: address || undefined, mapsUrl: mapsUrl || undefined }),
  });
  return (data as { pub: AdminPub }).pub;
}

export async function adminUpdatePub(id: string, updates: Partial<AdminPub>): Promise<AdminPub> {
  const { data } = await adminFetch(`/pubs/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
  return (data as { pub: AdminPub }).pub;
}

export async function adminDeletePub(id: string): Promise<{ action: string }> {
  const { data } = await adminFetch(`/pubs/${id}`, { method: 'DELETE' });
  return data as { action: string };
}

export async function adminGetBranding(): Promise<BrandingSettings> {
  const { data } = await adminFetch('/branding', { method: 'GET' });
  return (data as { branding: BrandingSettings }).branding;
}

export async function adminUpdateBranding(
  patch: Partial<BrandingSettings>
): Promise<BrandingSettings> {
  const { data } = await adminFetch('/branding', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return (data as { branding: BrandingSettings }).branding;
}
