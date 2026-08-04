import { useState } from 'react';
import { Pub } from '../types';

interface Props {
  pub: Pub;
  showBadge?: boolean;
  /** Entrance flourish right after the slot reveal lands. */
  celebrate?: boolean;
}

export default function PubCard({ pub, showBadge = true, celebrate = false }: Props) {
  const [mapOpen, setMapOpen] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);

  const handleMaps = () => {
    if (pub.mapsUrl) {
      window.open(pub.mapsUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleShare = async () => {
    const text = `This week's pub: ${pub.name}${pub.address ? ` — ${pub.address}` : ''}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Oracle', text });
      } catch {
        // User dismissed — no-op
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareNote('Copied');
      window.setTimeout(() => setShareNote(null), 2000);
    } catch {
      setShareNote('Couldn’t copy');
      window.setTimeout(() => setShareNote(null), 2000);
    }
  };

  const mapSrc = pub.address
    ? `https://maps.google.com/maps?q=${encodeURIComponent(pub.address)}&output=embed&z=16`
    : null;

  return (
    <div className={`card pub-card${celebrate ? ' pub-card--celebrate' : ''}`}>
      {showBadge && <div className="card-label">Hey — we&apos;re going to</div>}
      <h2 className="pub-name">{pub.name}</h2>
      {pub.address && <p className="pub-address">{pub.address}</p>}

      {mapSrc && mapOpen && (
        <div className="pub-map-wrap">
          <iframe
            src={mapSrc}
            className="pub-map"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title={`Map of ${pub.name}`}
          />
        </div>
      )}

      <div className="pub-actions">
        {pub.mapsUrl && (
          <button type="button" className="btn btn-primary" onClick={handleMaps}>
            Open in Maps
          </button>
        )}
        {mapSrc && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setMapOpen((o) => !o)}
            aria-expanded={mapOpen}
          >
            {mapOpen ? 'Hide map' : 'Show map'}
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={handleShare}>
          {shareNote ?? 'Share'}
        </button>
      </div>
    </div>
  );
}
