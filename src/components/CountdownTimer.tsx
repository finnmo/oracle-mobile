import { useState, useEffect, useRef } from 'react';
import { ClockIcon } from './PubIcons';

interface Props {
  targetUtc: string;
  serverNowUtc: string;
  label: string;
  timezone?: string;
}

interface Parts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
}

function getParts(targetMs: number, nowMs: number): Parts {
  const diff = Math.max(0, targetMs - nowMs);
  if (diff === 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, done: true };

  const days    = Math.floor(diff / 86_400_000);
  const hours   = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000)  / 60_000);
  const seconds = Math.floor((diff % 60_000)      / 1_000);

  return { days, hours, minutes, seconds, done: false };
}

function formatWhen(iso: string, timeZone: string): string {
  try {
    const formatted = new Intl.DateTimeFormat(undefined, {
      timeZone,
      weekday: 'long',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(iso));
    const shortTz = timeZone.includes('/') ? timeZone.split('/').pop()?.replace(/_/g, ' ') : timeZone;
    return shortTz ? `${formatted} ${shortTz}` : formatted;
  } catch {
    return '';
  }
}

export default function CountdownTimer({
  targetUtc,
  serverNowUtc,
  label,
  timezone = 'Australia/Perth',
}: Props) {
  const offsetRef = useRef<number>(0);
  const scheduleLine = formatWhen(targetUtc, timezone);
  const [parts, setParts] = useState<Parts>(() => {
    const offset = new Date(serverNowUtc).getTime() - Date.now();
    return getParts(new Date(targetUtc).getTime(), Date.now() + offset);
  });

  useEffect(() => {
    offsetRef.current = new Date(serverNowUtc).getTime() - Date.now();
  }, [serverNowUtc]);

  useEffect(() => {
    const targetMs = new Date(targetUtc).getTime();
    const tick = () => {
      setParts(getParts(targetMs, Date.now() + offsetRef.current));
    };
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [targetUtc]);

  const pad = (n: number) => String(n).padStart(2, '0');

  const lead =
    label.toLowerCase().includes('meet') ? 'Meet in:'
    : 'Announcing pub in:';

  if (parts.done) {
    return (
      <div className="card card--countdown" aria-label={label}>
        <div className="countdown-lead">
          <ClockIcon className="countdown-clock" />
          <span className="countdown-lead-text">{lead}</span>
        </div>
        <p className="countdown-soon">Any moment now…</p>
        {scheduleLine && <p className="countdown-when">{scheduleLine}</p>}
      </div>
    );
  }

  const showDays = parts.days > 0;

  return (
    <div className="card card--countdown" aria-label={label}>
      <div className="countdown-lead">
        <ClockIcon className="countdown-clock" />
        <span className="countdown-lead-text">{lead}</span>
      </div>
      <div className="countdown" aria-live="polite">
        {showDays && (
          <>
            <div className="countdown-unit">
              <span className="countdown-value">{parts.days}</span>
              <span className="countdown-label">days</span>
            </div>
            <span className="countdown-sep" aria-hidden />
          </>
        )}
        <div className="countdown-unit">
          <span className="countdown-value">{pad(parts.hours)}</span>
          <span className="countdown-label">hrs</span>
        </div>
        <span className="countdown-sep" aria-hidden />
        <div className="countdown-unit">
          <span className="countdown-value">{pad(parts.minutes)}</span>
          <span className="countdown-label">min</span>
        </div>
        <span className="countdown-sep" aria-hidden />
        <div className="countdown-unit">
          <span className="countdown-value countdown-value--sec">{pad(parts.seconds)}</span>
          <span className="countdown-label">sec</span>
        </div>
      </div>
      {scheduleLine && <p className="countdown-when">{scheduleLine}</p>}
    </div>
  );
}
