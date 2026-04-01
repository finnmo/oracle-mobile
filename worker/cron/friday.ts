import { Env } from '../types';
import {
  computeRoundTimingsFromAnchorYmd,
  tryResolveCronAnnounceAnchorPerthYmd,
} from '../timeUtils';
import { pickPubForWeek } from '../utils/pubPicker';

/** Cron strings registered in wrangler.toml (UTC; comma = Thu+Fri or Fri+Sat). */
export const CRON_ANNOUNCE = '45 3 * * 4,5';
export const CRON_OPEN_RATINGS = '20 4 * * 4,5';
export const CRON_CLOSE_RATINGS = '59 15 * * 5,6';

export async function handleCron(event: ScheduledEvent, env: Env): Promise<void> {
  const now = new Date(event.scheduledTime);

  switch (event.cron) {
    case CRON_ANNOUNCE:
      await announcePub(now, env);
      break;
    case CRON_OPEN_RATINGS:
      await openRatings(now, env);
      break;
    case CRON_CLOSE_RATINGS:
      await closeRatings(now, env);
      break;
    default:
      console.warn(`Unhandled cron expression: ${event.cron}`);
  }
}

// ─── Announce ───────────────────────────────────────────────────────────────

async function announcePub(now: Date, env: Env): Promise<void> {
  const anchorYmd = tryResolveCronAnnounceAnchorPerthYmd(now);
  if (!anchorYmd) {
    console.log('[cron] Announce skipped — not a pub-week announce day in Perth');
    return;
  }

  const timings = computeRoundTimingsFromAnchorYmd(anchorYmd);
  const { weekKey } = timings;

  const existing = await env.DB.prepare(
    'SELECT id, chosenPubId FROM rounds WHERE weekKey = ?'
  )
    .bind(weekKey)
    .first<{ id: string; chosenPubId: string | null }>();

  if (existing?.chosenPubId) {
    console.log(`[cron] Round ${weekKey} already has a pub — skipping`);
    return;
  }

  const pubId = await pickPubForWeek(env, weekKey);
  if (!pubId) {
    console.error('[cron] No active pubs found — cannot announce');
    return;
  }

  const nowIso = now.toISOString();

  if (existing) {
    await env.DB.prepare(`
      UPDATE rounds
      SET chosenPubId = ?, chosenAtUtc = ?, chosenBy = 'cron', status = 'announced'
      WHERE weekKey = ?
    `)
      .bind(pubId, nowIso, weekKey)
      .run();
  } else {
    await env.DB.prepare(`
      INSERT INTO rounds
        (id, weekKey, announceAtUtc, meetAtUtc, rateOpenAtUtc, rateCloseAtUtc,
         chosenPubId, chosenAtUtc, chosenBy, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'cron', 'announced')
    `)
      .bind(
        crypto.randomUUID(),
        weekKey,
        timings.announceAtUtc,
        timings.meetAtUtc,
        timings.rateOpenAtUtc,
        timings.rateCloseAtUtc,
        pubId,
        nowIso
      )
      .run();
  }

  console.log(`[cron] Round ${weekKey} announced — pub ${pubId}`);
}

// ─── Open ratings ────────────────────────────────────────────────────────────

async function openRatings(now: Date, env: Env): Promise<void> {
  const nowIso = now.toISOString();
  const result = await env.DB.prepare(`
    UPDATE rounds SET status = 'rating_open'
    WHERE status = 'announced' AND rateOpenAtUtc <= ?
  `)
    .bind(nowIso)
    .run();

  console.log(`[cron] Ratings opened (rows changed: ${result.meta.changes})`);
}

// ─── Close ratings ───────────────────────────────────────────────────────────

async function closeRatings(now: Date, env: Env): Promise<void> {
  const nowIso = now.toISOString();
  const result = await env.DB.prepare(`
    UPDATE rounds SET status = 'closed'
    WHERE status IN ('announced', 'rating_open') AND rateCloseAtUtc <= ?
  `)
    .bind(nowIso)
    .run();

  console.log(`[cron] Ratings closed (rows changed: ${result.meta.changes})`);
}
