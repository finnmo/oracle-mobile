import { useState, useEffect, useCallback } from 'react';
import { StatusResponse } from './types';
import { fetchStatus } from './api';
import CountdownTimer from './components/CountdownTimer';
import PubCard from './components/PubCard';
import RatingSection from './components/RatingSection';
import HistorySection from './components/HistorySection';
import StatsDrawer from './components/StatsDrawer';

const POLL_INTERVAL_MS = 30_000;

export default function App() {
  const [status, setStatus]     = useState<StatusResponse | null>(null);
  const [loading, setLoading]   = useState(true);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await fetchStatus();
      setStatus(s);
      setFetchErr(null);
    } catch (err) {
      setFetchErr(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + polling
  useEffect(() => {
    load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Re-sync on tab focus
  useEffect(() => {
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [load]);

  return (
    <div className="app">
      <header className="header">
        <h1>Oracle</h1>
        <p>Pub of the Week</p>
        <button className="hamburger" onClick={() => setMenuOpen(true)} aria-label="Open stats">
          <span /><span /><span />
        </button>
      </header>

      <StatsDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />

      <main>
        {loading && !status && (
          <div className="card loading-card">
            <div className="spinner" />
          </div>
        )}

        {fetchErr && !status && (
          <div className="card error-card">
            <p>{fetchErr}</p>
            <button className="btn btn-primary" onClick={load} style={{ marginTop: 12 }}>
              Retry
            </button>
          </div>
        )}

        {status && <StatusView status={status} onRefresh={load} />}
      </main>
    </div>
  );
}

// ─── Status view ─────────────────────────────────────────────────────────────

function StatusView({ status, onRefresh }: { status: StatusResponse; onRefresh: () => void }) {
  const { state, round, ratings, serverNowUtc } = status;

  return (
    <>
      {state === 'countdown_announce' && (
        <>
          <CountdownTimer
            targetUtc={round.announceAtUtc}
            serverNowUtc={serverNowUtc}
            label="Announcing in"
          />
        </>
      )}

      {state === 'announced' && round.pub && (
        <>
          <PubCard pub={round.pub} showBadge />
          <CountdownTimer
            targetUtc={round.meetAtUtc}
            serverNowUtc={serverNowUtc}
            label="Meet in"
          />
        </>
      )}

      {state === 'rating_open' && round.pub && round.id && (
        <>
          <PubCard pub={round.pub} showBadge={false} />
          <div className="card rating-open-badge">
            <div className="card-label">Ratings open</div>
            <p className="state-hint">Until midnight — go rate it!</p>
          </div>
          <RatingSection
            roundId={round.id}
            ratings={ratings}
            onRated={onRefresh}
          />
        </>
      )}

      {state === 'rating_closed' && round.pub && (
        <>
          <PubCard pub={round.pub} showBadge={false} />
          {ratings ? (
            <div className="card results-card">
              <div className="card-label">This week's result</div>
              <div className="result-score">
                <span className="result-avg">{ratings.average.toFixed(1)}</span>
                <span className="result-stars">
                  {'★'.repeat(Math.round(ratings.average))}
                  {'☆'.repeat(5 - Math.round(ratings.average))}
                </span>
              </div>
              <p className="result-count">
                {ratings.count} rating{ratings.count !== 1 ? 's' : ''}
              </p>
            </div>
          ) : (
            <div className="card">
              <p className="text-muted">No ratings this week.</p>
            </div>
          )}
        </>
      )}

      <HistorySection />
    </>
  );
}

