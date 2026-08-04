import { useState, useEffect, useCallback, useRef } from 'react';
import { SproutIcon } from './PubIcons';
import { BallotPub, VotesResponse } from '../types';
import { fetchVotes, castVote, castVeto, clearVote, getOrCreateDeviceId } from '../api';

export default function VotingSection() {
  const [data, setData]       = useState<VotesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState<string | null>(null);
  const [voting, setVoting]   = useState<string | null>(null);
  const [vetoing, setVetoing] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [vetoPickerOpen, setVetoPickerOpen] = useState(false);
  const [vetoTarget, setVetoTarget] = useState<BallotPub | null>(null);

  const deviceId = getOrCreateDeviceId();

  const load = useCallback(async () => {
    try {
      const v = await fetchVotes(deviceId);
      setData(v);
      setErr(null);
    } catch {
      setErr('Could not load votes');
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const handleVote = async (pub: BallotPub) => {
    if (voting) return;
    // Clicking your current vote removes it
    if (data?.userVote === pub.id) {
      setVoting(pub.id);
      setActionErr(null);
      try {
        await clearVote(deviceId);
        await load();
      } catch (e) {
        setActionErr(e instanceof Error ? e.message : 'Could not remove vote');
      } finally {
        setVoting(null);
      }
      return;
    }
    setVoting(pub.id);
    setActionErr(null);
    try {
      await castVote(pub.id, deviceId);
      await load();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : 'Vote failed');
    } finally {
      setVoting(null);
    }
  };

  const handleVetoConfirmed = async () => {
    if (!vetoTarget || vetoing || data?.userVetoUsed) return;
    setVetoing(true);
    setActionErr(null);
    try {
      await castVeto(vetoTarget.id, deviceId);
      await load();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : 'Veto failed');
    } finally {
      setVetoing(false);
      setVetoTarget(null);
    }
  };

  if (loading) {
    return (
      <div className="card">
        <div className="card-label">This week&apos;s vote</div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="card">
        <div className="card-label">This week&apos;s vote</div>
        <p className="text-muted">{err ?? 'No data'}</p>
        <button type="button" className="btn btn-primary" onClick={() => { setLoading(true); load(); }} style={{ marginTop: 12 }}>
          Retry
        </button>
      </div>
    );
  }

  const maxVotes = Math.max(1, ...data.pubs.map(p => p.votes));
  const vetoable = data.pubs.filter(p => !p.vetoed);
  const myVetoPub = data.userVetoedPubId
    ? data.pubs.find(p => p.id === data.userVetoedPubId)
    : null;

  return (
    <div className="vote-section">
      <div className="vote-section-head">
        <div className="vote-section-top">
          <h2 className="vote-section-title">
            <SproutIcon className="vote-sprout" />
            This week&apos;s vote
          </h2>
          {!data.userVetoUsed && vetoable.length > 0 && (
            <button
              type="button"
              className="vote-veto-btn"
              onClick={() => setVetoPickerOpen(true)}
              disabled={vetoing}
            >
              Monthly veto
            </button>
          )}
          {data.userVetoUsed && (
            <span className="vote-veto-used">
              {myVetoPub
                ? `Vetoed: ${myVetoPub.name}`
                : 'Veto used'}
            </span>
          )}
        </div>
        <div className="vote-section-rule" aria-hidden="true" />
      </div>

      <div className="vote-list" role="list">
        {data.pubs.map(pub => {
          const isMyVote = data.userVote === pub.id;
          const isVetoed = pub.vetoed;
          const isMyVeto = data.userVetoedPubId === pub.id;

          return (
            <div
              key={pub.id}
              className={`card vote-row ${isVetoed ? 'vote-row--vetoed' : ''} ${isMyVote ? 'vote-row--mine' : ''} ${!isVetoed ? 'vote-row--tappable' : ''}`}
              role="listitem"
              tabIndex={!isVetoed ? 0 : undefined}
              aria-label={`${pub.name}, ${pub.votes} vote${pub.votes !== 1 ? 's' : ''}${isVetoed ? ', vetoed' : ''}${isMyVote ? ', your vote — activate to remove' : ''}`}
              onClick={!isVetoed ? () => handleVote(pub) : undefined}
              onKeyDown={!isVetoed ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleVote(pub);
                }
              } : undefined}
            >
              <div
                className={`vote-count-badge ${pub.votes > 0 ? 'vote-count-badge--hot' : ''} ${isMyVote ? 'vote-count-badge--mine' : ''}`}
                aria-hidden
              >
                <span className="vote-count-badge-num">{pub.votes}</span>
              </div>

              <div className="vote-row-info">
                <span className="vote-pub-name">
                  {pub.name}
                  {isVetoed && (
                    <span className="veto-badge">{isMyVeto ? 'your veto' : 'vetoed'}</span>
                  )}
                  {isMyVote && <span className="you-badge">YOU</span>}
                </span>
                <div className="vote-bar-track" role="progressbar" aria-valuenow={pub.votes} aria-valuemin={0} aria-valuemax={maxVotes}>
                  <div
                    className="vote-bar-fill"
                    style={{ transform: `scaleX(${Math.max(pub.votes / maxVotes, pub.votes > 0 ? 0.04 : 0)})` }}
                  />
                </div>
              </div>

              <div className="vote-row-actions">
                {!isVetoed && (
                  <button
                    className={`btn vote-btn ${isMyVote ? 'vote-btn--active' : 'vote-btn--outline'}`}
                    onClick={(e) => { e.stopPropagation(); handleVote(pub); }}
                    disabled={voting === pub.id}
                    type="button"
                    aria-pressed={isMyVote}
                  >
                    {isMyVote ? '✓ Voted' : 'Vote'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {actionErr && <p className="inline-error" style={{ marginTop: 8 }}>{actionErr}</p>}

      <details className="vote-how">
        <summary>How votes &amp; vetoes work</summary>
        <div className="vote-how-body">
          <p>
            Your vote is tied to this browser — tap your vote again to clear it while voting is open.
          </p>
          <p>
            With votes cast, the pick goes to the highest count (ties: first to reach it).
            With zero votes, Oracle picks a random active pub, skipping vetoed pubs and usually the last three visited.
          </p>
          <p>
            A veto removes a pub from the random pool this week only — one per calendar month.
            It does not override a clear vote winner.
          </p>
        </div>
      </details>

      {vetoPickerOpen && (
        <VetoPickerModal
          pubs={vetoable}
          onPick={(pub) => {
            setVetoPickerOpen(false);
            setVetoTarget(pub);
          }}
          onCancel={() => setVetoPickerOpen(false)}
        />
      )}

      {vetoTarget && (
        <VetoConfirmModal
          pubName={vetoTarget.name}
          onConfirm={handleVetoConfirmed}
          onCancel={() => setVetoTarget(null)}
          confirming={vetoing}
        />
      )}
    </div>
  );
}

function VetoPickerModal({
  pubs,
  onPick,
  onCancel,
}: {
  pubs: BallotPub[];
  onPick: (pub: BallotPub) => void;
  onCancel: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  return (
    <div className="veto-modal-backdrop" onClick={onCancel}>
      <div
        className="veto-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="veto-picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="veto-modal-title" id="veto-picker-title">Veto a pub</h3>
        <p className="veto-modal-message">
          One per month. Excludes them from a random pick this week — not from a vote winner.
        </p>
        <ul className="veto-picker-list">
          {pubs.map(pub => (
            <li key={pub.id}>
              <button
                type="button"
                className="btn btn-secondary btn-full"
                onClick={() => onPick(pub)}
              >
                {pub.name}
              </button>
            </li>
          ))}
        </ul>
        <div className="veto-modal-actions">
          <button ref={closeRef} className="btn btn-secondary" onClick={onCancel} type="button">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function VetoConfirmModal({
  pubName,
  onConfirm,
  onCancel,
  confirming,
}: {
  pubName: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirming: boolean;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
        return;
      }

      if (e.key === 'Tab') {
        const btns = [cancelRef.current, confirmRef.current].filter(Boolean) as HTMLElement[];
        if (btns.length < 2) return;
        if (e.shiftKey && document.activeElement === btns[0]) {
          e.preventDefault();
          btns[btns.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === btns[btns.length - 1]) {
          e.preventDefault();
          btns[0].focus();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  return (
    <div className="veto-modal-backdrop" onClick={onCancel}>
      <div
        className="veto-modal"
        role="alertdialog"
        aria-modal="true"
        aria-describedby="veto-modal-msg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="veto-modal-title">Confirm veto</h3>
        <p className="veto-modal-message" id="veto-modal-msg">
          Veto &ldquo;{pubName}&rdquo;? This is your one veto for the month.
        </p>
        <div className="veto-modal-actions">
          <button
            ref={cancelRef}
            className="btn btn-secondary"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={confirming}
            type="button"
          >
            {confirming ? 'Vetoing…' : 'Confirm veto'}
          </button>
        </div>
      </div>
    </div>
  );
}
