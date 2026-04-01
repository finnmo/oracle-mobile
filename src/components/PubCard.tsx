import { useState } from 'react';
import { Pub } from '../types';

interface Props {
  pub: Pub;
  showBadge?: boolean;
}

export default function PubCard({ pub, showBadge = true }: Props) {
  const [mapOpen, setMapOpen] = useState(false);

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
    } else {
      await navigator.clipboard.writeText(text);
      alert('Copied to clipboard!');
    }
  };

  // Build a Google Maps embed URL from the address
  const mapSrc = pub.address
    ? `https://maps.google.com/maps?q=${encodeURIComponent(pub.address)}&output=embed&z=16`
    : null;

  return (
    <div className="card pub-card">
      {showBadge && <div className="card-label">Hey — we&apos;re going to</div>}
      <h2 className="pub-name">{pub.name}</h2>
      {pub.address && <p className="pub-address">{pub.address}</p>}

      {mapSrc && (
        <div className="pub-map-wrap">
          {mapOpen ? (
            <iframe
              src={mapSrc}
              className="pub-map"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title={`Map of ${pub.name}`}
            />
          ) : (
            <button className="pub-map-toggle" onClick={() => setMapOpen(true)}>
              Show map
            </button>
          )}
        </div>
      )}

      <div className="pub-actions">
        {pub.mapsUrl && (
          <button className="btn btn-primary" onClick={handleMaps}>
            Open in Maps
          </button>
        )}
        <button className="btn btn-secondary" onClick={handleShare}>
          Share
        </button>
        {mapOpen && (
          <button className="btn btn-secondary" onClick={() => setMapOpen(false)}>
            Hide map
          </button>
        )}
      </div>
    </div>
  );
}
