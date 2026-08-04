import {
  StatusResponse,
  HistoryRound,
  StatsResponse,
  VotesResponse,
  AdminPub,
  PubReviewsResponse,
} from './types';

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

/** Production Workers URL — used to bypass Access when an API token is set. */
const WORKERS_DEV_ADMIN = 'https://oracle.example-account.workers.dev/api/admin';

async function adminFetch(path: string, options: RequestInit = {}): Promise<{ res: Response; data: unknown }> {
  const token = (getAdminToken() ?? '').replace(/[^\x20-\x7E]/g, '');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  // Only send Bearer when a token is stored; otherwise rely on Cloudflare Access cookies
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Access on the custom domain intercepts /api/admin/* before the Worker sees Bearer.
  // Token login therefore goes to workers.dev (CORS allows this origin). Access-cookie
  // sessions stay same-origin so CF_Authorization is sent.
  const onCustomDomain =
    typeof window !== 'undefined' && window.location.hostname === 'picker.example.com';
  const useTokenBypass = Boolean(token) && onCustomDomain;
  const url = `${useTokenBypass ? WORKERS_DEV_ADMIN : '/api/admin'}${path}`;

  const res = await fetch(url, {
    ...options,
    credentials: useTokenBypass ? 'omit' : 'include',
    redirect: 'manual',
    headers,
  });

  // Access login redirect (same-origin) when session cookie is missing/expired
  if (res.status >= 300 && res.status < 400) {
    throw new Error('Access session missing — open /admin and sign in with Google, or use an API token');
  }

  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    if (text.includes('cloudflareaccess') || text.includes('Sign in') || text.includes('302 Found')) {
      throw new Error('Access blocked this admin API call — protect only /admin (not /api/admin), or use an API token');
    }
    const snippet = text.replace(/\s+/g, ' ').slice(0, 80);
    throw new Error(`Admin API returned non-JSON (${res.status})${snippet ? `: ${snippet}` : ''}`);
  }

  if (res.status === 401 || res.status === 403) {
    if (token) clearAdminToken();
    throw new Error('Unauthorized — Access JWT not accepted (check AUD / team domain) or use API token');
  }
  if (!res.ok) throw new Error((data as Record<string, string>).error ?? 'Request failed');
  return { res, data };
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
