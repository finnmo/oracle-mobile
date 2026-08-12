import { BrandIcon } from './BrandIcon';
import { useBranding } from '../context/BrandingContext';

interface Props {
  /** Seconds remaining until announce (0 when at/after the wire). */
  secondsLeft: number;
}

export default function OracleThinking({ secondsLeft }: Props) {
  const { branding } = useBranding();
  const atWire = secondsLeft <= 0;
  const title = branding.title;

  return (
    <div
      className={`oracle-thinking${atWire ? ' oracle-thinking--deciding' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={atWire ? `${title} is deciding` : `${title} is thinking`}
    >
      <div className="oracle-thinking-rings" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <BrandIcon className="oracle-thinking-mark" branding={branding} />

      <p className="oracle-thinking-title">
        {atWire ? `${title} has decided…` : `${title} is thinking…`}
      </p>

      {!atWire ? (
        <p className="oracle-thinking-count" aria-hidden="true">
          <span className="oracle-thinking-sec" key={secondsLeft}>{secondsLeft}</span>
          <span className="oracle-thinking-sec-label">
            second{secondsLeft === 1 ? '' : 's'}
          </span>
        </p>
      ) : (
        <p className="oracle-thinking-sub">Rolling the options…</p>
      )}
    </div>
  );
}
