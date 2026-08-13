import { Env } from '../types';
import {
  computeRoundTimingsFromAnchorYmd,
  tryResolveCronAnnounceAnchorYmd,
} from '../timeUtils';
import { buildCronBundle, getSchedule } from '../schedule';
import { pickPubForWeek } from '../utils/pubPicker';

/** Cron strings for DEFAULT_SCHEDULE (Perth Friday) — used by unit tests. */
export const CRON_ANNOUNCE = '0 2 * * THU,FRI';
export const CRON_OPEN_RATINGS = '20 4 * * THU,FRI';
export const CRON_CLOSE_RATINGS = '59 15 * * FRI,SAT';

export async function handleCron(event: ScheduledEvent, env: Env): Promise<void> {
  const now = new Date(event.scheduledTime);
  const schedule = getSchedule(env);
  const crons = buildCronBundle(schedule, now);

  // Run on every cron so a missed close firing is caught by the next announce/open cron.
  await closeRatings(now, env);

  if (event.cron === crons.announce) {
    await announcePub(now, env);
    return;
  }
  if (event.cron === crons.openRatings) {
    await openRatings(now, env);
    return;
  }
  if (event.cron === crons.closeRatings) {
    return;
  }

  // Fallback: match legacy Perth constants (existing Workers mid-migrate)
  switch (event.cron) {
    case CRON_ANNOUNCE:
      await announcePub(now, env);
      break;
    case CRON_OPEN_RATINGS:
      await openRatings(now, env);
      break;
    case CRON_CLOSE_RATINGS:
      break;
    default:
      console.warn(`Unhandled cron expression: ${event.cron}`);
  }
}

async function announcePub(now: Date, env: Env): Promise<void> {
  const schedule = getSchedule(env);
  const anchorYmd = tryResolveCronAnnounceAnchorYmd(now, schedule);
  if (!anchorYmd) {
    console.log('[cron] Announce skipped — not an announce day for this schedule');
    return;
  }

  const timings = computeRoundTimingsFromAnchorYmd(anchorYmd, schedule);
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
