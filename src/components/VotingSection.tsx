import { useState, useEffect, useCallback } from 'react';
import { BallotPub, VotesResponse } from '../types';
import { fetchVotes, castVote, castVeto, clearVote, getOrCreateDeviceId } from '../api';

export default function VotingSection() {
  const [data, setData]       = useState<VotesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState<string | null>(null);
  const [voting, setVoting]   = useState<string | null>(null); // pubId being voted
  const [vetoing, setVetoing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);

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

  const handleVeto = async (pub: BallotPub) => {
    if (vetoing || data?.userVetoUsed) return;
    if (!confirm(`Veto "${pub.name}"? This excludes it from the random pick this week. You only get one veto per month.`)) return;
    setVetoing(true);
    setActionErr(null);
    try {
      await castVeto(pub.id, deviceId);
      await load();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : 'Veto failed');
    } finally {
      setVetoing(false);
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
      <p className="vote-lede">
        <strong>One pub per person per week</strong> on this phone — tracked with a random id stored in your browser
        (no account). Change pub anytime, or use <strong>Undo vote</strong> to remove yours. Shared Wi‑Fi is fine.
      </p>
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

      <div className="vote-list">
        {data.pubs.map(pub => {
          const isMyVote  = data.userVote === pub.id;
          const isVetoed  = pub.vetoed;
          const isMyVeto  = data.userVetoedPubId === pub.id;

          return (
            <div
              key={pub.id}
              className={`vote-row ${isVetoed ? 'vote-row--vetoed' : ''} ${isMyVote ? 'vote-row--mine' : ''}`}
            >
              <div className="vote-row-info">
                <span className="vote-pub-name">
                  {pub.name}
                  {isVetoed && <span className="veto-badge">vetoed</span>}
                </span>
                <div className="vote-bar-track">
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
                    onClick={() => handleVeto(pub)}
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
    </div>
  );
}
