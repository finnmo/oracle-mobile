import { BenchIcon } from './PubIcons';

interface Props {
  /** Seconds remaining until announce (0 when at/after the wire). */
  secondsLeft: number;
}

export default function OracleThinking({ secondsLeft }: Props) {
  const atWire = secondsLeft <= 0;

  return (
    <div
      className={`oracle-thinking${atWire ? ' oracle-thinking--deciding' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={atWire ? 'The Oracle is deciding' : 'The Oracle is thinking'}
    >
      <div className="oracle-thinking-rings" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <BenchIcon className="oracle-thinking-mark" />

      <p className="oracle-thinking-title">
        {atWire ? 'The Oracle has decided…' : 'The Oracle is thinking…'}
      </p>

      {!atWire ? (
        <p className="oracle-thinking-count" aria-hidden="true">
          <span className="oracle-thinking-sec" key={secondsLeft}>{secondsLeft}</span>
          <span className="oracle-thinking-sec-label">
            second{secondsLeft === 1 ? '' : 's'}
          </span>
        </p>
      ) : (
        <p className="oracle-thinking-sub">Rolling the pubs…</p>
      )}
    </div>
  );
}
