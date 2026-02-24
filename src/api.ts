import { StatusResponse, HistoryRound, StatsResponse } from './types';

const BASE = '/api';

export async function fetchStatus(): Promise<StatusResponse> {
  const res = await fetch(`${BASE}/status`);
  if (!res.ok) throw new Error(`Status fetch failed: ${res.status}`);
  return res.json() as Promise<StatusResponse>;
}

export async function fetchHistory(): Promise<HistoryRound[]> {
  const res = await fetch(`${BASE}/rounds`);
  if (!res.ok) throw new Error(`History fetch failed: ${res.status}`);
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
    throw new Error(data.error ?? `Submit failed: ${res.status}`);
  }

  return data.ratings!;
}

export async function fetchStats(): Promise<StatsResponse> {
  const res = await fetch(`${BASE}/stats`);
  if (!res.ok) throw new Error(`Stats fetch failed: ${res.status}`);
  return res.json() as Promise<StatsResponse>;
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
