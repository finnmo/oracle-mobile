import { useState, useEffect } from 'react';
import { HistoryRound } from '../types';
import { fetchHistory } from '../api';
import PubReviewsList from './PubReviewsList';

export default function HistorySection() {
  const [rounds, setRounds] = useState<HistoryRound[] | null>(null);

  useEffect(() => {
    fetchHistory()
      .then(setRounds)
      .catch(() => setRounds([]));
  }, []);

  if (!rounds || rounds.length === 0) return null;

  return (
    <div className="history">
      <h3 className="history-title">Past Weeks</h3>
      <div className="history-list">
        {rounds.map((r) => (
          <HistoryItem key={r.weekKey} round={r} />
        ))}
      </div>
    </div>
  );
}

function HistoryItem({ round }: { round: HistoryRound }) {
  const [open, setOpen] = useState(false);
  const panelId = `history-reviews-${round.weekKey}`;

  const date = new Date(round.announceAtUtc);
  const dateStr = date.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Australia/Perth',
  });

  return (
    <div className={`history-item-block ${open ? 'history-item-block--open' : ''}`}>
      <button
        type="button"
        className="history-item-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span className="history-chevron" aria-hidden>{open ? '▼' : '▶'}</span>
        <div className="history-item-left">
          <span className="history-date">{dateStr}</span>
          <span className="history-pub">{round.pubName ?? 'Unknown pub'}</span>
        </div>
        <div className="history-item-right">
          {round.average != null ? (
            <>
              <span className="history-avg">{round.average.toFixed(1)} ★</span>
              <span className="history-count">{round.ratingCount}</span>
            </>
          ) : (
            <span className="history-noratings">No ratings</span>
          )}
        </div>
      </button>

      {open && round.pubId && (
        <div
          className="history-reviews-panel"
          id={panelId}
          role="region"
          aria-label={`Reviews for ${round.pubName ?? 'pub'}`}
        >
          <PubReviewsList pubId={round.pubId} />
        </div>
      )}

      {open && !round.pubId && (
        <div className="history-reviews-panel" id={panelId}>
          <p className="pub-reviews-empty">No pub data available for this round.</p>
        </div>
      )}
    </div>
  );
}
