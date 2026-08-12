import { BrandingSettings } from './types';

export const DEFAULT_BRANDING: BrandingSettings = {
  title: 'Weekly Picker',
  accentColor: '#374151',
  mainColor: '#1f2937',
  backgroundColor: '#f5f5f5',
  iconSvg: null,
  faviconDataUrl: null,
};

function svgToDataUrl(svg: string): string {
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, '%27')
    .replace(/"/g, '%22');
  return `data:image/svg+xml,${encoded}`;
}

function setMeta(name: string, content: string): void {
  let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.name = name;
    document.head.appendChild(el);
  }
  el.content = content;
}

function setLink(rel: string, href: string, type?: string): void {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
  if (type) el.type = type;
  else el.removeAttribute('type');
}

/** Apply branding to document CSS variables, title, and favicon. */
export function applyBranding(branding: BrandingSettings): void {
  const root = document.documentElement;
  const { accentColor, mainColor, backgroundColor, title } = branding;

  root.style.setProperty('--accent', accentColor);
  root.style.setProperty('--green', accentColor);
  root.style.setProperty('--header-bg', mainColor);
  root.style.setProperty('--bg', backgroundColor);
  root.style.setProperty('--accent-dim', `color-mix(in srgb, ${accentColor} 72%, black)`);
  root.style.setProperty('--timber', `color-mix(in srgb, ${backgroundColor} 62%, ${mainColor} 38%)`);
  root.style.setProperty('--timber-deep', `color-mix(in srgb, ${backgroundColor} 48%, ${mainColor} 52%)`);
  root.style.setProperty('--sand', `color-mix(in srgb, ${backgroundColor} 35%, ${mainColor} 65%)`);
  root.style.setProperty('--surface-2', `color-mix(in srgb, ${backgroundColor} 88%, white)`);
  root.style.setProperty('--border', `color-mix(in srgb, ${mainColor} 22%, ${backgroundColor})`);
  root.style.setProperty('--border-strong', `color-mix(in srgb, ${mainColor} 42%, ${backgroundColor})`);
  root.style.setProperty('--text', `color-mix(in srgb, ${mainColor} 88%, black)`);
  root.style.setProperty('--text-muted', `color-mix(in srgb, ${mainColor} 52%, ${backgroundColor})`);
  root.style.setProperty('--header-fg', `color-mix(in srgb, ${backgroundColor} 92%, white)`);

  document.title = title;
  setMeta('theme-color', mainColor);
  setMeta('apple-mobile-web-app-title', title);
  setMeta('description', `${title} — weekly group picker`);

  const favicon =
    branding.faviconDataUrl ??
    (branding.iconSvg ? svgToDataUrl(branding.iconSvg) : '/icon.svg');

  setLink('icon', favicon, favicon.startsWith('data:image/svg') ? 'image/svg+xml' : undefined);
  setLink('apple-touch-icon', favicon);
}

/** Read a user-uploaded icon file into branding fields. */
export async function readIconFile(
  file: File
): Promise<Pick<BrandingSettings, 'iconSvg' | 'faviconDataUrl'>> {
  if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
    const text = await file.text();
    const svg = text.trim();
    if (!/^<svg[\s>]/i.test(svg)) {
      throw new Error('Icon must be a valid SVG file');
    }
    return {
      iconSvg: svg,
      faviconDataUrl: svgToDataUrl(svg),
    };
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('Icon must be PNG, SVG, or WebP');
  }
  if (file.size > 150_000) {
    throw new Error('Icon file is too large (max 150 KB)');
  }

  const faviconDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read icon file'));
    reader.readAsDataURL(file);
  });

  return { iconSvg: null, faviconDataUrl };
}
