import { Pub } from '../types';

interface Props {
  pub: Pub;
  showBadge?: boolean;
}

export default function PubCard({ pub, showBadge = true }: Props) {
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

  return (
    <div className="card pub-card">
      {showBadge && <div className="card-label">This Friday</div>}
      <h2 className="pub-name">{pub.name}</h2>
      {pub.address && <p className="pub-address">{pub.address}</p>}
      <div className="pub-actions">
        {pub.mapsUrl && (
          <button className="btn btn-primary" onClick={handleMaps}>
            Open in Maps
          </button>
        )}
        <button className="btn btn-secondary" onClick={handleShare}>
          Share
        </button>
      </div>
    </div>
  );
}
