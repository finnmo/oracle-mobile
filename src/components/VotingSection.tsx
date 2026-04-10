import { useState, useEffect, useCallback, useRef } from 'react';
import { BallotPub, VotesResponse } from '../types';
import { fetchVotes, castVote, castVeto, clearVote, getOrCreateDeviceId } from '../api';

export default function VotingSection() {
  const [data, setData]       = useState<VotesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState<string | null>(null);
  const [voting, setVoting]   = useState<string | null>(null);
  const [vetoing, setVetoing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);
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

  const handleClearVote = async () => {
    if (clearing || !data?.userVote) return;
    setClearing(true);
    setActionErr(null);
    try {
      await clearVote(deviceId);
      await load();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : 'Could not remove vote');
    } finally {
      setClearing(false);
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
        <div className="card-label">This week's vote</div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="card">
        <div className="card-label">This week's vote</div>
        <p className="text-muted">{err ?? 'No data'}</p>
      </div>
    );
  }

  const maxVotes = Math.max(1, ...data.pubs.map(p => p.votes));

  return (
    <div className="card vote-card">
      <div className="card-label">This week's vote</div>
      <p className="vote-hint">
        {data.totalVotes === 0
          ? 'No votes yet — be the first!'
          : `${data.totalVotes} vote${data.totalVotes !== 1 ? 's' : ''} cast${data.userVote ? ' · your choice is highlighted' : ''}`}
      </p>

      {data.userVote && (
        <div className="vote-undo-row">
          <button
            type="button"
            className="btn btn-secondary vote-undo-btn"
            onClick={handleClearVote}
            disabled={clearing}
          >
            {clearing ? '…' : 'Undo vote'}
          </button>
          <span className="vote-undo-hint">Removes your vote only — not someone else&apos;s</span>
        </div>
      )}

      <div className="vote-list" role="list">
        {data.pubs.map(pub => {
          const isMyVote  = data.userVote === pub.id;
          const isVetoed  = pub.vetoed;
          const isMyVeto  = data.userVetoedPubId === pub.id;

          return (
            <div
              key={pub.id}
              className={`vote-row ${isVetoed ? 'vote-row--vetoed' : ''} ${isMyVote ? 'vote-row--mine' : ''}`}
              role="listitem"
              aria-label={`${pub.name}, ${pub.votes} vote${pub.votes !== 1 ? 's' : ''}${isVetoed ? ', vetoed' : ''}`}
            >
              <div className="vote-row-info">
                <span className="vote-pub-name">
                  {pub.name}
                  {isVetoed && <span className="veto-badge">vetoed</span>}
                </span>
                <div className="vote-bar-track" role="progressbar" aria-valuenow={pub.votes} aria-valuemin={0} aria-valuemax={maxVotes}>
                  <div
                    className="vote-bar-fill"
                    style={{ width: `${(pub.votes / maxVotes) * 100}%` }}
                  />
                </div>
                <span className="vote-count">{pub.votes} vote{pub.votes !== 1 ? 's' : ''}</span>
              </div>

              <div className="vote-row-actions">
                <button
                  className={`btn vote-btn ${isMyVote ? 'vote-btn--active' : 'btn-secondary'}`}
                  onClick={() => handleVote(pub)}
                  disabled={voting === pub.id}
                >
                  {isMyVote ? '✓ Voted' : 'Vote'}
                </button>

                {!data.userVetoUsed && !isVetoed && (
                  <button
                    className="btn veto-btn btn-secondary"
                    onClick={() => setVetoTarget(pub)}
                    disabled={vetoing}
                    title="Veto this pub — excludes it from the random pick this week (once per month)"
                  >
                    Veto
                  </button>
                )}
                {isMyVeto && (
                  <span className="veto-used-label">your veto</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {data.userVetoUsed && !data.userVetoedPubId && (
        <p className="vote-footnote text-muted">You've used your veto this month.</p>
      )}

      {actionErr && <p className="inline-error" style={{ marginTop: 8 }}>{actionErr}</p>}

      <details className="vote-how">
        <summary>How votes, vetoes &amp; random picks work</summary>
        <div className="vote-how-body">
          <p>
            <strong>Your vote</strong> is tied to this browser only — use <strong>Undo vote</strong> to delete it
            while voting is open. You can&apos;t change someone else&apos;s vote.
          </p>
          <p>
            <strong>If anyone has voted:</strong> the scheduled pick (or automatic picker) chooses the pub with the{' '}
            <strong>highest vote count</strong>. Ties are broken in favour of the pub that reached that count first.
          </p>
          <p>
            <strong>If there are zero votes:</strong> Oracle picks a random active pub, skipping pubs{' '}
            <strong>vetoed this week</strong> and usually the <strong>last three</strong> pubs we already went to
            (with fallbacks if that leaves nobody).
          </p>
          <p>
            <strong>Vetoes</strong> only apply when the choice would otherwise be random — they remove a pub from that
            pool for this week. You get <strong>one veto per calendar month</strong>.
          </p>
          <p className="vote-how-admin">
            <strong>Admin</strong> can always announce a specific pub for the week, which overrides the rules above.
          </p>
        </div>
      </details>

      <p className="vote-footnote text-muted">
        {!data.userVetoUsed && 'You have one veto this month (see above). '}
        Voting closes once this week&apos;s pub is announced.
      </p>

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
          Veto &ldquo;{pubName}&rdquo;? This excludes it from the random pick this week.
          You only get one veto per month.
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
            {confirming ? 'Vetoing…' : 'Veto'}
          </button>
        </div>
      </div>
    </div>
  );
}
