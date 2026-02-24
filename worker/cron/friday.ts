import { Env } from '../types';
import { computeRoundTimings } from '../timeUtils';
import { pickPubForWeek } from '../utils/pubPicker';

export async function handleCron(event: ScheduledEvent, env: Env): Promise<void> {
  const now = new Date(event.scheduledTime);

  switch (event.cron) {
    case '0 2 * * 5':   // Friday 02:00 UTC → announce pub
      await announcePub(now, env);
      break;
    case '20 4 * * 5':  // Friday 04:20 UTC → open ratings
      await openRatings(now, env);
      break;
    case '59 15 * * 6': // Saturday 15:59 UTC → close ratings
      await closeRatings(now, env);
      break;
    default:
      console.warn(`Unhandled cron expression: ${event.cron}`);
  }
}

// ─── Announce ───────────────────────────────────────────────────────────────

async function announcePub(now: Date, env: Env): Promise<void> {
  const timings = computeRoundTimings(now); // now IS Friday 02:00 UTC
  const { weekKey } = timings;

  const existing = await env.DB.prepare(
    'SELECT id, chosenPubId FROM rounds WHERE weekKey = ?'
  ).bind(weekKey).first<{ id: string; chosenPubId: string | null }>();

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
    `).bind(pubId, nowIso, weekKey).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO rounds
        (id, weekKey, announceAtUtc, meetAtUtc, rateOpenAtUtc, rateCloseAtUtc,
         chosenPubId, chosenAtUtc, chosenBy, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'cron', 'announced')
    `).bind(
      crypto.randomUUID(),
      weekKey,
      timings.announceAtUtc,
      timings.meetAtUtc,
      timings.rateOpenAtUtc,
      timings.rateCloseAtUtc,
      pubId,
      nowIso
    ).run();
  }

  console.log(`[cron] Round ${weekKey} announced — pub ${pubId}`);
}

// ─── Open ratings ────────────────────────────────────────────────────────────

async function openRatings(now: Date, env: Env): Promise<void> {
  const timings = computeRoundTimings(now);
  const { weekKey } = timings;

  const result = await env.DB.prepare(`
    UPDATE rounds SET status = 'rating_open'
    WHERE weekKey = ? AND status = 'announced'
  `).bind(weekKey).run();

  console.log(`[cron] Ratings opened for ${weekKey} (changed: ${result.meta.changes})`);
}

// ─── Close ratings ───────────────────────────────────────────────────────────

async function closeRatings(now: Date, env: Env): Promise<void> {
  // Cron fires Saturday 15:59 UTC — the target weekKey is yesterday (Friday)
  const friday = new Date(now);
  friday.setUTCDate(friday.getUTCDate() - 1);
  const timings = computeRoundTimings(friday);
  const { weekKey } = timings;

  const result = await env.DB.prepare(`
    UPDATE rounds SET status = 'closed'
    WHERE weekKey = ? AND status IN ('announced', 'rating_open')
  `).bind(weekKey).run();

  console.log(`[cron] Ratings closed for ${weekKey} (changed: ${result.meta.changes})`);
}

