import { useState, useEffect } from 'react';
import { RatingStats } from '../types';
import { submitRating, getOrCreateDeviceId } from '../api';

interface Props {
  roundId: string;
  ratings: RatingStats | null;
  onRated: () => void;
  userRated?: boolean;
  userScore?: number;
}

export default function RatingSection({
  roundId,
  ratings,
  onRated,
  userRated,
  userScore,
}: Props) {
  const [selected, setSelected] = useState<number | null>(userScore ?? null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(Boolean(userRated));
  const [lockedScore, setLockedScore] = useState<number | null>(
    userScore != null && userScore >= 1 && userScore <= 5 ? userScore : null
  );
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (userRated) {
      setSubmitted(true);
      if (userScore != null && userScore >= 1 && userScore <= 5) {
        setLockedScore(userScore);
        setSelected(userScore);
      }
    }
  }, [userRated, userScore]);

  const handleSubmit = async () => {
    if (!selected) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      await submitRating(roundId, selected, comment, getOrCreateDeviceId());
      setLockedScore(selected);
      setSubmitted(true);
      onRated();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const displayScore = hovered ?? selected;
  const shownScore = lockedScore ?? selected ?? 0;

  if (submitted) {
    return (
      <div className="card">
        <div className="card-label">Your rating</div>
        <div className="rating-submitted">
          <span className="submitted-stars" aria-label={`${shownScore} out of 5`}>
            {'★'.repeat(shownScore)}
            {'☆'.repeat(Math.max(0, 5 - shownScore))}
          </span>
          {shownScore > 0 && (
            <p className="rating-submitted-score">{shownScore} / 5</p>
          )}
          <p>Thanks — locked to this browser for the week.</p>
        </div>
        {ratings && <RatingSummary ratings={ratings} />}
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-label">Rate this week's pub</div>
      <p className="rating-lock-hint">
        Ratings open until midnight. One rating per browser — you can&apos;t change it after submit.
      </p>

      <div className="stars" role="group" aria-label="Star rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`star-btn ${displayScore && displayScore >= n ? 'active' : ''}`}
            onClick={() => setSelected(n)}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(null)}
            aria-label={`${n} star${n !== 1 ? 's' : ''}`}
            aria-pressed={selected === n}
          >
            ★
          </button>
        ))}
      </div>
      {selected && (
        <p className="rating-selected-label" aria-live="polite">
          {selected} / 5
        </p>
      )}

      {selected && (
        <div className="rating-form">
          <label className="sr-only" htmlFor="rating-comment">
            Optional comment
          </label>
          <textarea
            id="rating-comment"
            placeholder="Leave a comment (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
            rows={3}
          />
          <button
            type="button"
            className="btn btn-primary btn-full"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Submitting…' : 'Submit rating'}
          </button>
        </div>
      )}

      {submitError && (
        <p className="inline-error" role="alert">{submitError}</p>
      )}

      {ratings && <RatingSummary ratings={ratings} />}
    </div>
  );
}

function RatingSummary({ ratings }: { ratings: RatingStats }) {
  return (
    <div className="rating-summary">
      <span className="rating-avg">{ratings.average.toFixed(1)}</span>
      <span className="rating-stars">
        {'★'.repeat(Math.round(ratings.average))}
        {'☆'.repeat(5 - Math.round(ratings.average))}
      </span>
      <span className="rating-count">
        from {ratings.count} rating{ratings.count !== 1 ? 's' : ''}
      </span>
    </div>
  );
}
