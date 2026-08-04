import { useState, useEffect, useCallback, useRef } from 'react';
import { StatusResponse } from './types';
import { fetchStatus } from './api';
import { fireAnnounceCelebration } from './celebrate';
import CountdownTimer from './components/CountdownTimer';
import PubCard from './components/PubCard';
import SlotReveal from './components/SlotReveal';
import RatingSection from './components/RatingSection';
import HistorySection from './components/HistorySection';
import StatsDrawer, { StatsPanel } from './components/StatsDrawer';
import { BenchIcon, ChartIcon } from './components/PubIcons';
import VotingSection from './components/VotingSection';
import AdminPage from './components/AdminPage';
import PubCrawlGame from './components/PubCrawlGame';

const POLL_INTERVAL_MS = 30_000; // fallback polling interval when SSE is active

// ── Path-based routing (Access can protect /admin; hashes cannot) ─────────────

function usePathname() {
  const [pathname, setPathname] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return pathname;
}

export default function App() {
  const pathname = usePathname();

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return <AdminPage onBack={() => { window.location.href = '/'; }} />;
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
  const [gameOpen, setGameOpen] = useState(false);

  const revealKeyRef = useRef<string | null>(null);
  const prevStateRef = useRef<string | null>(null);
  const [pubsReady, setPubsReady] = useState(false);
  const [justRevealed, setJustRevealed] = useState(false);

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
      .then((d: { pubs: { name: string }[] }) => {
        setPubNames((d.pubs ?? []).map((p) => p.name));
        setPubsReady(true);
      })
      .catch(() => setPubsReady(true));
  }, []);

  // Celebrate when we enter "announced", or when admin re-picks (chosenAtUtc / pub changes).
  // No sessionStorage — refresh and live SSE transitions both get the show.
  useEffect(() => {
    const state = status?.state ?? null;
    const round = status?.round;
    const pub = round?.pub ?? null;
    const prevState = prevStateRef.current;
    prevStateRef.current = state;

    if (state !== 'announced' || !round || !pub || !pubsReady || revealing) return;

    const revealKey = [round.id ?? '', pub.id, round.chosenAtUtc ?? ''].join(':');

    const liveTransition = prevState !== null && prevState !== 'announced';
    const alreadyPlayedThisPick = revealKeyRef.current === revealKey;

    // Skip only if we already played this exact pick in this tab, and this isn't a
    // live countdown→announced transition.
    if (alreadyPlayedThisPick && !liveTransition) return;

    if (pubNames.length > 1) {
      revealKeyRef.current = revealKey;
      setJustRevealed(false);
      setRevealing(true);
      return;
    }

    // Empty pool (shouldn't happen) — confetti only
    revealKeyRef.current = revealKey;
    setJustRevealed(true);
    fireAnnounceCelebration();
  }, [
    status?.state,
    status?.round,
    pubsReady,
    pubNames.length,
    revealing,
  ]);

  const handleRevealComplete = useCallback(() => {
    setRevealing(false);
    setJustRevealed(true);
    fireAnnounceCelebration();
  }, []);

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div
            className="header-brand"
            onClick={() => {
              const now = Date.now();
              const key = '__ot';
              const raw = sessionStorage.getItem(key);
              const { count, ts } = raw ? JSON.parse(raw) as { count: number; ts: number } : { count: 0, ts: 0 };
              const next = now - ts < 1500 ? count + 1 : 1;
              if (next >= 5) { sessionStorage.removeItem(key); setGameOpen(v => !v); }
              else sessionStorage.setItem(key, JSON.stringify({ count: next, ts: now }));
            }}
          >
            <BenchIcon className="header-bench" />
            <h1>The Oracle</h1>
          </div>
          <div className="header-actions">
            <button
              type="button"
              className="header-menu-btn"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
            >
              <span className="header-menu-icon" aria-hidden>
                <span />
                <span />
                <span />
              </span>
            </button>
            <a href="/admin" className="header-admin-link">Admin</a>
          </div>
        </div>
        <div className="header-rule" aria-hidden="true" />
      </header>

      <div className="app-body">
        <main className="app-main">
          {gameOpen && <PubCrawlGame pubs={pubNames} onClose={() => setGameOpen(false)} />}

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
              justRevealed={justRevealed}
              pubNames={pubNames}
              onRevealComplete={handleRevealComplete}
            />
          )}
        </main>

        <aside className="stats-rail" aria-label="Stats">
          <h2 className="stats-rail-title">
            <ChartIcon className="stats-title-icon" />
            Stats
          </h2>
          <StatsPanel compact />
        </aside>
      </div>

      <StatsDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}

// ── Status view ───────────────────────────────────────────────────────────────

interface StatusViewProps {
  status: StatusResponse;
  onRefresh: () => void;
  revealing: boolean;
  justRevealed: boolean;
  pubNames: string[];
  onRevealComplete: () => void;
}

function StatusView({ status, onRefresh, revealing, justRevealed, pubNames, onRevealComplete }: StatusViewProps) {
  const { state, round, ratings, serverNowUtc } = status;

  return (
    <div className="status-stack">
      {state === 'countdown_announce' && (
        <>
          <CountdownTimer
            targetUtc={round.announceAtUtc}
            serverNowUtc={serverNowUtc}
            label="Announce"
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
            <PubCard pub={round.pub} showBadge celebrate={justRevealed} />
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
          <RatingSection
            roundId={round.id}
            ratings={ratings}
            onRated={onRefresh}
            userRated={status.userRated}
            userScore={status.userScore}
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
    </div>
  );
}
