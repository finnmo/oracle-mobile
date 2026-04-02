import { useState, useEffect, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import { StatusResponse } from './types';
import { fetchStatus } from './api';
import CountdownTimer from './components/CountdownTimer';
import PubCard from './components/PubCard';
import SlotReveal from './components/SlotReveal';
import RatingSection from './components/RatingSection';
import HistorySection from './components/HistorySection';
import StatsDrawer from './components/StatsDrawer';
import VotingSection from './components/VotingSection';
import AdminPage from './components/AdminPage';

const POLL_INTERVAL_MS = 30_000; // fallback polling interval when SSE is active

// ── Simple hash-based routing ─────────────────────────────────────────────────

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const handler = () => setHash(window.location.hash);
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHashRoute();

  if (hash === '#admin') {
    return <AdminPage onBack={() => { window.location.hash = ''; }} />;
  }

  return <MainApp />;
}

// ── Main app ──────────────────────────────────────────────────────────────────

function MainApp() {
  const [status, setStatus]     = useState<StatusResponse | null>(null);
  const [loading, setLoading]   = useState(true);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pubNames, setPubNames] = useState<string[]>([]);
  const [revealing, setRevealing] = useState(false);

  const confettiFiredRef = useRef(false);
  const lastRoundIdRef = useRef<string | null>(null);

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

  // SSE for real-time updates; falls back to polling if unsupported
  useEffect(() => {
    load(); // immediate fetch on mount

    if (typeof EventSource === 'undefined') {
      // No SSE support — fall back to polling
      const id = setInterval(load, POLL_INTERVAL_MS);
      return () => clearInterval(id);
    }

    let es: EventSource;
    let fallbackTimer: ReturnType<typeof setInterval>;

    const connect = () => {
      es = new EventSource('/api/events');

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          setStatus(data);
          setLoading(false);
          setFetchErr(null);
        } catch { /* ignore malformed events */ }
      };

      es.onerror = () => {
        // EventSource auto-reconnects; start a fallback poll in case it can't
        clearInterval(fallbackTimer);
        fallbackTimer = setInterval(load, POLL_INTERVAL_MS);
      };

      es.onopen = () => {
        // SSE connected — stop fallback polling
        clearInterval(fallbackTimer);
      };
    };

    connect();
    // Fallback poll so we never go stale if SSE is slow to connect
    fallbackTimer = setInterval(load, POLL_INTERVAL_MS);

    return () => {
      es?.close();
      clearInterval(fallbackTimer);
    };
  }, [load]);

  // Re-fetch immediately when the app regains focus/visibility (e.g. switching back on mobile)
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener('focus', load);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', load);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  // Fetch active pub names once for the slot reveal animation
  useEffect(() => {
    fetch('/api/pubs')
      .then((r) => r.json())
      .then((d: { pubs: { name: string }[] }) => setPubNames(d.pubs.map((p) => p.name)))
      .catch(() => {});
  }, []);

  // Reset confetti flag when round changes
  useEffect(() => {
    const roundId = status?.round?.id ?? null;
    if (roundId && roundId !== lastRoundIdRef.current) {
      lastRoundIdRef.current = roundId;
      confettiFiredRef.current = false;
      setRevealing(false);
    }
  }, [status?.round?.id]);

  // Trigger slot reveal when state transitions to 'announced'
  useEffect(() => {
    if (status?.state === 'announced' && !confettiFiredRef.current && pubNames.length > 1) {
      setRevealing(true);
    }
  }, [status?.state, pubNames.length]);

  const handleRevealComplete = useCallback(() => {
    setRevealing(false);
    confettiFiredRef.current = true;
    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.4 },
      colors: ['#f59e0b', '#fcd34d', '#fbbf24', '#e8f0f8', '#7d9ab5'],
    });
  }, []);

  return (
    <div className="app">
      <header className="header">
        <h1>Oracle</h1>
        <p>🍺🍗🍷🥩 Pub of the Week</p>
        <nav className="header-nav">
          <button
            className="btn btn-secondary header-admin-btn"
            onClick={() => { window.location.hash = 'admin'; }}
          >
            Admin
          </button>
          <button className="hamburger" onClick={() => setMenuOpen(true)} aria-label="Open stats">
            <span /><span /><span />
          </button>
        </nav>
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

        {status && (
          <StatusView
            status={status}
            onRefresh={load}
            revealing={revealing}
            pubNames={pubNames}
            onRevealComplete={handleRevealComplete}
          />
        )}
      </main>
    </div>
  );
}

// ── Status view ───────────────────────────────────────────────────────────────

interface StatusViewProps {
  status: StatusResponse;
  onRefresh: () => void;
  revealing: boolean;
  pubNames: string[];
  onRevealComplete: () => void;
}

function StatusView({ status, onRefresh, revealing, pubNames, onRevealComplete }: StatusViewProps) {
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
          <VotingSection />
        </>
      )}

      {state === 'announced' && round.pub && (
        <>
          {revealing ? (
            <SlotReveal
              finalPub={round.pub}
              allPubNames={pubNames}
              onComplete={onRevealComplete}
            />
          ) : (
            <PubCard pub={round.pub} showBadge />
          )}
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
            userRated={status.userRated}
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
