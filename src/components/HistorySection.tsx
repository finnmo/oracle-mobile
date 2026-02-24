import { useState, useEffect } from 'react';
import { HistoryRound } from '../types';
import { fetchHistory } from '../api';

export default function HistorySection() {
  const [rounds, setRounds] = useState<HistoryRound[] | null>(null);

  useEffect(() => {
    fetchHistory()
      .then(setRounds)
      .catch(() => setRounds([]));
  }, []);

  if (!rounds || rounds.length === 0) return null;

  return (
    <div className="history">
      <h3 className="history-title">Past Weeks</h3>
      <div className="history-list">
        {rounds.map((r) => (
          <HistoryItem key={r.weekKey} round={r} />
        ))}
      </div>
    </div>
  );
}

function HistoryItem({ round }: { round: HistoryRound }) {
  const date = new Date(round.announceAtUtc);
  const dateStr = date.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Australia/Perth',
  });

  return (
    <div className="history-item">
      <div className="history-item-left">
        <span className="history-date">{dateStr}</span>
        <span className="history-pub">{round.pubName ?? 'Unknown pub'}</span>
      </div>
      <div className="history-item-right">
        {round.average != null ? (
          <>
            <span className="history-avg">{round.average.toFixed(1)} ★</span>
            <span className="history-count">{round.ratingCount}</span>
          </>
        ) : (
          <span className="history-noratings">No ratings</span>
        )}
      </div>
    </div>
  );
}
