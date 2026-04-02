import { useEffect, useState } from 'react';
import { PubReview } from '../types';
import { fetchPubReviews } from '../api';

export default function PubReviewsList({ pubId }: { pubId: string }) {
  const [reviews, setReviews] = useState<PubReview[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    fetchPubReviews(pubId)
      .then((r) => {
        if (!cancelled) setReviews(r.reviews);
      })
      .catch((e) => {
        if (!cancelled) setErr(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pubId]);

  if (loading) {
    return <div className="pub-reviews-loading">Loading reviews…</div>;
  }
  if (err) {
    return <p className="inline-error pub-reviews-err">{err}</p>;
  }
  if (!reviews || reviews.length === 0) {
    return <p className="pub-reviews-empty">No ratings recorded yet for this pub.</p>;
  }

  return (
    <ul className="pub-reviews-list">
      {reviews.map((rev, i) => (
        <li
          key={`${rev.createdAtUtc}-${i}`}
          className="review-card"
          style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
        >
          <div className="review-card-top">
            <span className="review-week">{formatWeekLabel(rev.weekKey)}</span>
            <span className="review-stars" aria-label={`${rev.score} out of 5`}>
              {'★'.repeat(rev.score)}
              {'☆'.repeat(5 - rev.score)}
            </span>
          </div>
          {rev.comment && rev.comment.trim() ? (
            <p className="review-text">{rev.comment}</p>
          ) : (
            <p className="review-text review-text--muted">No comment</p>
          )}
        </li>
      ))}
    </ul>
  );
}

function formatWeekLabel(weekKey: string): string {
  const [y, m, d] = weekKey.split('-').map(Number);
  if (!y || !m || !d) return weekKey;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
