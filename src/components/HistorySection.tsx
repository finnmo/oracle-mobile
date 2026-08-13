import { useState, useEffect } from 'react';
import { HistoryRound, ScheduleInfo } from '../types';
import { fetchHistory, fetchStatus } from '../api';
import PubReviewsList from './PubReviewsList';

export default function HistorySection() {
  const [rounds, setRounds] = useState<HistoryRound[] | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [timezone, setTimezone] = useState('Australia/Perth');

  const load = () => {
    setLoadErr(false);
    Promise.all([fetchHistory(), fetchStatus().catch(() => null)])
      .then(([r, status]) => {
        setRounds(r);
        const tz = (status?.schedule as ScheduleInfo | undefined)?.timezone;
        if (tz) setTimezone(tz);
        setLoadErr(false);
      })
      .catch(() => {
        setRounds(null);
        setLoadErr(true);
      });
  };

  useEffect(() => {
    load();
  }, []);

  if (loadErr) {
    return (
      <div className="history">
        <p className="text-muted" style={{ marginBottom: 8 }}>Couldn’t load past weeks.</p>
        <button type="button" className="btn btn-secondary" onClick={load}>
          Retry
        </button>
      </div>
    );
  }

  if (!rounds || rounds.length === 0) return null;

  return (
    <details className="history history-disclosure">
      <summary className="history-title">Past Weeks</summary>
      <div className="history-list">
        {rounds.map((r) => (
          <HistoryItem key={r.weekKey} round={r} timezone={timezone} />
        ))}
      </div>
    </details>
  );
}

function HistoryItem({ round, timezone }: { round: HistoryRound; timezone: string }) {
  const [open, setOpen] = useState(false);
  const panelId = `history-reviews-${round.weekKey}`;

  const date = new Date(round.announceAtUtc);
  const dateStr = date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: timezone,
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
