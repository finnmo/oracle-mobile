import { BrandingSettings } from '../types';
import { MarkIcon } from './PubIcons';

interface Props {
  className?: string;
  branding: BrandingSettings;
}

/** Header icon — custom SVG/image from DB, or neutral mark for blank template. */
export function BrandIcon({ className, branding }: Props) {
  if (branding.iconSvg) {
    return (
      <span
        className={className}
        dangerouslySetInnerHTML={{ __html: branding.iconSvg }}
        aria-hidden
      />
    );
  }

  const imgSrc = branding.faviconDataUrl;
  if (imgSrc) {
    return (
      <img
        className={className}
        src={imgSrc}
        alt=""
        aria-hidden
        draggable={false}
      />
    );
  }

  return <MarkIcon className={className} />;
}
