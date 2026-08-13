/**
 * Pure helpers for scripts/onboard.mjs (unit-tested; no Cloudflare side effects).
 */

export function setTomlVar(content, key, value) {
  const line = `${key} = "${value}"`;
  const re = new RegExp(`^${key}\\s*=.*$`, 'm');
  if (re.test(content)) return content.replace(re, line);
  if (/\[vars\]/.test(content)) {
    return content.replace(/\[vars\]/, `[vars]\n${line}`);
  }
  return `${content.trimEnd()}\n\n[vars]\n${line}\n`;
}

export function setCronBlock(content, cronLines) {
  const cronBlock =
    cronLines.length === 0
      ? `[triggers]\ncrons = []`
      : `[triggers]\ncrons = [\n${cronLines.map((c) => `  "${c}",`).join('\n')}\n]`;
  if (/\[triggers\][\s\S]*?crons\s*=\s*\[[\s\S]*?\]/.test(content)) {
    return content.replace(/\[triggers\][\s\S]*?crons\s*=\s*\[[\s\S]*?\]/, cronBlock);
  }
  return `${content.trimEnd()}\n\n${cronBlock}\n`;
}

/** True when SITE_ORIGIN is a workers.dev URL missing the account subdomain. */
export function isIncompleteWorkersDevOrigin(origin, workerName) {
  const o = String(origin || '').replace(/\/$/, '');
  if (!o) return true;
  if (o === `https://${workerName}.workers.dev`) return true;
  // https://something.workers.dev — exactly one label before workers.dev
  return /^https:\/\/[a-z0-9-]+\.workers\.dev$/i.test(o);
}

export function extractWorkersDevUrl(text, workerName) {
  const urls = [...String(text).matchAll(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/gi)].map(
    (m) => m[0].replace(/\/$/, '')
  );
  const match = urls.find((u) => u.toLowerCase().includes(`${workerName.toLowerCase()}.`));
  return match || urls[0] || null;
}

export function isCronLimitError(text) {
  const s = String(text);
  return (
    /Workers Free limit of \d+ cron triggers/i.test(s) ||
    /cron triggers per account/i.test(s) ||
    /code: 10072/i.test(s)
  );
}

/**
 * Decide whether to rewrite SITE_ORIGIN to the live workers.dev URL after deploy.
 * Never overwrite an intentional custom domain.
 */
export function shouldSyncSiteOriginToWorkersDev(configuredOrigin, liveUrl, workerName) {
  if (!liveUrl) return false;
  const configured = String(configuredOrigin || '').replace(/\/$/, '');
  const live = String(liveUrl).replace(/\/$/, '');
  if (configured === live) return false;
  return isIncompleteWorkersDevOrigin(configured, workerName);
}
