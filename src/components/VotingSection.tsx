import { useState, useEffect, useCallback } from 'react';
import { BallotPub, VotesResponse } from '../types';
import { fetchVotes, castVote, castVeto, getOrCreateDeviceId } from '../api';

export default function VotingSection() {
  const [data, setData]       = useState<VotesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState<string | null>(null);
  const [voting, setVoting]   = useState<string | null>(null); // pubId being voted
  const [vetoing, setVetoing] = useState(false);
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
      <p className="vote-hint">
        {data.totalVotes === 0
          ? 'No votes yet — be the first!'
          : `${data.totalVotes} vote${data.totalVotes !== 1 ? 's' : ''} cast${data.userVote ? ' · your vote is highlighted' : ''}`}
      </p>

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

      <p className="vote-footnote text-muted">
        Votes influence the random pick — top voted pub wins unless admin overrides.
        {!data.userVetoUsed && ' You have one veto remaining this month.'}
      </p>
    </div>
  );
}
