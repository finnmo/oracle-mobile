import { useEffect, useState, useRef, useCallback } from 'react';
import { StatsResponse, PubStat } from '../types';
import { fetchStats } from '../api';
import PubReviewsList from './PubReviewsList';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function StatsDrawer({ open, onClose }: Props) {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hasFetched = useRef(false);
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open || hasFetched.current) return;
    hasFetched.current = true;
    setLoading(true);
    fetchStats()
      .then(setData)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [open]);

  // Store the element that opened the drawer so we can restore focus on close
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement;
      requestAnimationFrame(() => closeRef.current?.focus());
    } else if (triggerRef.current) {
      triggerRef.current.focus();
      triggerRef.current = null;
    }
  }, [open]);

  // Escape to close + focus trap
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key !== 'Tab' || !drawerRef.current) return;

      const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  return (
    <>
      <div
        className={`drawer-backdrop ${open ? 'open' : ''}`}
        onClick={onClose}
        aria-hidden
      />

      <aside
        ref={drawerRef}
        className={`stats-drawer ${open ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stats-title"
      >
        <div className="drawer-header">
          <h2 className="drawer-title" id="stats-title">Stats</h2>
          <button ref={closeRef} className="drawer-close" onClick={onClose} aria-label="Close">
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

