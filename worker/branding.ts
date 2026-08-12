import { Env } from './types';

export interface BrandingSettings {
  title: string;
  accentColor: string;
  mainColor: string;
  backgroundColor: string;
  /** Raw SVG markup for the header icon (sanitized on save). */
  iconSvg: string | null;
  /** Data URL for tab / PWA favicon (PNG or SVG). */
  faviconDataUrl: string | null;
}

export const DEFAULT_BRANDING: BrandingSettings = {
  title: 'Weekly Picker',
  accentColor: '#374151',
  mainColor: '#1f2937',
  backgroundColor: '#f5f5f5',
  iconSvg: null,
  faviconDataUrl: null,
};

const SETTINGS_KEY = 'branding';
const MAX_SVG_LEN = 50_000;
const MAX_FAVICON_LEN = 200_000;

const HEX_COLOR = /^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/;

export function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!HEX_COLOR.test(trimmed)) return fallback;
  if (trimmed.length === 4) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  return trimmed.toLowerCase();
}

function sanitizeSvg(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') return null;
  const svg = raw.trim();
  if (!svg || svg.length > MAX_SVG_LEN) return null;
  if (!/^<svg[\s>]/i.test(svg)) return null;
  const lower = svg.toLowerCase();
  if (
    lower.includes('<script') ||
    lower.includes('javascript:') ||
    lower.includes('onload=') ||
    lower.includes('onclick=') ||
    lower.includes('foreignobject')
  ) {
    return null;
  }
  return svg;
}

function sanitizeFavicon(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') return null;
  const url = raw.trim();
  if (!url || url.length > MAX_FAVICON_LEN) return null;
  if (!/^data:image\/(png|svg\+xml|webp|jpeg);base64,/i.test(url)) return null;
  return url;
}

export function mergeBranding(
  current: BrandingSettings,
  patch: Partial<BrandingSettings>
): BrandingSettings {
  const next: BrandingSettings = { ...current };

  if (patch.title !== undefined) {
    const title = String(patch.title).trim().slice(0, 80);
    if (title) next.title = title;
  }
  if (patch.accentColor !== undefined) {
    next.accentColor = normalizeHexColor(patch.accentColor, current.accentColor);
  }
  if (patch.mainColor !== undefined) {
    next.mainColor = normalizeHexColor(patch.mainColor, current.mainColor);
  }
  if (patch.backgroundColor !== undefined) {
    next.backgroundColor = normalizeHexColor(patch.backgroundColor, current.backgroundColor);
  }
  if (patch.iconSvg !== undefined) {
    next.iconSvg = patch.iconSvg === null ? null : sanitizeSvg(patch.iconSvg);
  }
  if (patch.faviconDataUrl !== undefined) {
    next.faviconDataUrl =
      patch.faviconDataUrl === null ? null : sanitizeFavicon(patch.faviconDataUrl);
  }

  return next;
}

export async function getBranding(env: Env): Promise<BrandingSettings> {
  try {
    const row = await env.DB.prepare(
      'SELECT value FROM app_settings WHERE key = ?'
    ).bind(SETTINGS_KEY).first<{ value: string }>();

    if (!row?.value) return { ...DEFAULT_BRANDING };

    const parsed = JSON.parse(row.value) as Partial<BrandingSettings>;
    return mergeBranding(DEFAULT_BRANDING, parsed);
  } catch (err) {
    console.error('getBranding failed:', err);
    return { ...DEFAULT_BRANDING };
  }
}

export async function saveBranding(env: Env, branding: BrandingSettings): Promise<void> {
  const value = JSON.stringify(branding);
  await env.DB.prepare(
    `INSERT INTO app_settings (key, value, updatedAt)
     VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updatedAt = excluded.updatedAt`
  ).bind(SETTINGS_KEY, value).run();
}
