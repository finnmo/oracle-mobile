import { useEffect, useState, useRef } from 'react';
import { StatsResponse, PubStat } from '../types';
import { fetchStats } from '../api';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function StatsDrawer({ open, onClose }: Props) {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hasFetched = useRef(false);

  // Fetch stats the first time the drawer opens
  useEffect(() => {
    if (!open || hasFetched.current) return;
    hasFetched.current = true;
    setLoading(true);
    fetchStats()
      .then(setData)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`drawer-backdrop ${open ? 'open' : ''}`}
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer panel */}
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

// ─── Stats content ────────────────────────────────────────────────────────────

function StatsContent({ data }: { data: StatsResponse }) {
  const { pubs, totalVisits, totalRatings, bestPub } = data;
  const maxVisits = Math.max(...pubs.map((p) => p.visits), 1);
  const visited = pubs.filter((p) => p.visits > 0);
  const unvisited = pubs.filter((p) => p.visits === 0);

  return (
    <>
      {/* Summary row */}
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

      {/* Bar chart */}
      <div className="stats-chart-title">Visits per pub</div>
      <div className="stats-chart">
        {visited.map((pub) => (
          <PubBar key={pub.id} pub={pub} maxVisits={maxVisits} />
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

function PubBar({ pub, maxVisits }: { pub: PubStat; maxVisits: number }) {
  const pct = Math.max((pub.visits / maxVisits) * 100, 4);
  const ratingColor = pub.avgScore == null
    ? 'var(--surface-2)'
    : pub.avgScore >= 4
    ? 'var(--accent)'
    : pub.avgScore >= 3
    ? '#d97706'
    : '#92400e';

  return (
    <div className="pub-bar-row">
      <div className="pub-bar-name" title={pub.name}>{pub.name}</div>
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
  );
}
