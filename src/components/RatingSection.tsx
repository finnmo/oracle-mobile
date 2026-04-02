import { useState } from 'react';
import { RatingStats } from '../types';
import { submitRating, getOrCreateDeviceId } from '../api';

interface Props {
  roundId: string;
  ratings: RatingStats | null;
  onRated: () => void;
  userRated?: boolean;
}

export default function RatingSection({ roundId, ratings, onRated, userRated }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(userRated ?? false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!selected) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      await submitRating(roundId, selected, comment, getOrCreateDeviceId());
      setSubmitted(true);
      onRated();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const displayScore = hovered ?? selected;

  if (submitted) {
    return (
      <div className="card">
        <div className="card-label">Your rating</div>
        <div className="rating-submitted">
          <span className="submitted-stars">{'★'.repeat(selected ?? 0)}{'☆'.repeat(5 - (selected ?? 0))}</span>
          <p>Thanks for rating!</p>
        </div>
        {ratings && <RatingSummary ratings={ratings} />}
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-label">Rate this week's pub</div>

      <div className="stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            className={`star-btn ${displayScore && displayScore >= n ? 'active' : ''}`}
            onClick={() => setSelected(n)}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(null)}
            aria-label={`${n} star${n !== 1 ? 's' : ''}`}
          >
            ★
          </button>
        ))}
      </div>

      {selected && (
        <div className="rating-form">
          <textarea
            placeholder="Leave a comment (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
            rows={3}
          />
          <button
            className="btn btn-primary btn-full"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Submitting…' : 'Submit Rating'}
          </button>
        </div>
      )}

      {submitError && (
        <p className="inline-error">{submitError}</p>
      )}

      {ratings && <RatingSummary ratings={ratings} />}
    </div>
  );
}

function RatingSummary({ ratings }: { ratings: RatingStats }) {
  return (
    <div className="rating-summary">
      <span className="rating-avg">{ratings.average.toFixed(1)}</span>
      <span className="rating-stars">{'★'.repeat(Math.round(ratings.average))}{'☆'.repeat(5 - Math.round(ratings.average))}</span>
      <span className="rating-count">from {ratings.count} rating{ratings.count !== 1 ? 's' : ''}</span>
    </div>
  );
}
