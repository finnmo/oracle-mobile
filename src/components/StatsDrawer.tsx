import { useEffect, useState, useRef } from 'react';
import { StatsResponse, PubStat, PubReview } from '../types';
import { fetchStats, fetchPubReviews } from '../api';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function StatsDrawer({ open, onClose }: Props) {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!open || hasFetched.current) return;
    hasFetched.current = true;
    setLoading(true);
    fetchStats()
      .then(setData)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <>
      <div
        className={`drawer-backdrop ${open ? 'open' : ''}`}
        onClick={onClose}
        aria-hidden
      />

      <aside className={`stats-drawer ${open ? 'open' : ''}`} aria-label="Stats">
        <div className="drawer-header">
          <h2 className="drawer-title">Stats</h2>
          <button className="drawer-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="drawer-body">
          {loading && (
            <div className="drawer-loading">
              <div className="spinner" />
            </div>
          )}

          {err && <p className="inline-error">{err}</p>}

          {data && <StatsContent data={data} />}
        </div>
      </aside>
    </>
  );
}

function StatsContent({ data }: { data: StatsResponse }) {
  const { pubs, totalVisits, totalRatings, bestPub } = data;
  const maxVisits = Math.max(...pubs.map((p) => p.visits), 1);
  const visited = pubs.filter((p) => p.visits > 0);
  const unvisited = pubs.filter((p) => p.visits === 0);

  return (
    <>
      <div className="stats-summary">
        <SummaryStat label="Total visits" value={totalVisits} />
        <SummaryStat label="Total ratings" value={totalRatings} />
        <SummaryStat label="Pubs visited" value={visited.length} />
      </div>

      {bestPub && bestPub.avgScore != null && (
        <div className="stats-best">
          <span className="stats-best-label">Top rated</span>
          <span className="stats-best-name">{bestPub.name}</span>
          <span className="stats-best-score">{bestPub.avgScore.toFixed(1)} ★</span>
        </div>
      )}

      <div className="stats-chart-title">Visits per pub</div>
      <p className="stats-hint">Tap a pub to read reviews</p>
      <div className="stats-chart">
        {visited.map((pub) => (
          <PubBarExpandable key={pub.id} pub={pub} maxVisits={maxVisits} />
        ))}
        {visited.length === 0 && (
          <p className="text-muted" style={{ fontSize: 14 }}>No closed rounds yet.</p>
        )}
      </div>

      {unvisited.length > 0 && (
        <>
          <div className="stats-chart-title" style={{ marginTop: 24 }}>Not yet visited</div>
          <div className="stats-unvisited">
            {unvisited.map((pub) => (
              <span key={pub.id} className="unvisited-pill">{pub.name}</span>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="summary-stat">
      <span className="summary-value">{value}</span>
      <span className="summary-label">{label}</span>
    </div>
  );
}

function PubBarExpandable({ pub, maxVisits }: { pub: PubStat; maxVisits: number }) {
  const [open, setOpen] = useState(false);
  const pct = Math.max((pub.visits / maxVisits) * 100, 4);
  const ratingColor = pub.avgScore == null
    ? 'var(--surface-2)'
    : pub.avgScore >= 4
    ? 'var(--accent)'
    : pub.avgScore >= 3
    ? '#d97706'
    : '#92400e';

  return (
    <div className={`pub-bar-block ${open ? 'pub-bar-block--open' : ''}`}>
      <button
        type="button"
        className="pub-bar-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={`reviews-${pub.id}`}
        id={`pub-head-${pub.id}`}
      >
        <div className="pub-bar-row-inner">
          <div className="pub-bar-name-row">
            <span className="pub-bar-chevron" aria-hidden>{open ? '▼' : '▶'}</span>
            <span className="pub-bar-name" title={pub.name}>{pub.name}</span>
          </div>
          <div className="pub-bar-track">
            <div
              className="pub-bar-fill"
              style={{ width: `${pct}%`, background: ratingColor }}
            />
          </div>
          <div className="pub-bar-meta">
            <span className="pub-bar-visits">
              {pub.visits} {pub.visits === 1 ? 'visit' : 'visits'}
            </span>
            {pub.avgScore != null && (
              <span className="pub-bar-rating">{pub.avgScore.toFixed(1)} ★</span>
            )}
          </div>
        </div>
      </button>

      {open && (
        <div className="pub-reviews-panel" id={`reviews-${pub.id}`} role="region" aria-labelledby={`pub-head-${pub.id}`}>
          <PubReviewsList pubId={pub.id} />
        </div>
      )}
    </div>
  );
}

function PubReviewsList({ pubId }: { pubId: string }) {
  const [reviews, setReviews] = useState<PubReview[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    fetchPubReviews(pubId)
      .then((r) => {
        if (!cancelled) setReviews(r.reviews);
      })
      .catch((e) => {
        if (!cancelled) setErr(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pubId]);

  if (loading) {
    return <div className="pub-reviews-loading">Loading reviews…</div>;
  }
  if (err) {
    return <p className="inline-error pub-reviews-err">{err}</p>;
  }
  if (!reviews || reviews.length === 0) {
    return <p className="pub-reviews-empty">No ratings recorded yet for this pub.</p>;
  }

  return (
    <ul className="pub-reviews-list">
      {reviews.map((rev, i) => (
        <li
          key={`${rev.createdAtUtc}-${i}`}
          className="review-card"
          style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
        >
          <div className="review-card-top">
            <span className="review-week">{formatWeekLabel(rev.weekKey)}</span>
            <span className="review-stars" aria-label={`${rev.score} out of 5`}>
              {'★'.repeat(rev.score)}
              {'☆'.repeat(5 - rev.score)}
            </span>
          </div>
          {rev.comment && rev.comment.trim() ? (
            <p className="review-text">{rev.comment}</p>
          ) : (
            <p className="review-text review-text--muted">No comment</p>
          )}
        </li>
      ))}
    </ul>
  );
}

function formatWeekLabel(weekKey: string): string {
  const [y, m, d] = weekKey.split('-').map(Number);
  if (!y || !m || !d) return weekKey;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
