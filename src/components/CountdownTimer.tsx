import { useState, useEffect, useRef } from 'react';

interface Props {
  targetUtc: string;
  serverNowUtc: string;
  label: string;
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

export default function CountdownTimer({ targetUtc, serverNowUtc, label }: Props) {
  // Compute the offset between server clock and local clock once on mount/prop change
  const offsetRef = useRef<number>(0);
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
      const nowMs = Date.now() + offsetRef.current;
      setParts(getParts(targetMs, nowMs));
    };

    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [targetUtc]);

  const pad = (n: number) => String(n).padStart(2, '0');

  if (parts.done) {
    return (
      <div className="card">
        <div className="card-label">{label}</div>
        <p className="countdown-soon">Any moment now…</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-label">{label}</div>
      <div className="countdown">
        {parts.days > 0 && (
          <>
            <div className="countdown-unit">
              <span className="countdown-value">{parts.days}</span>
              <span className="countdown-label">days</span>
            </div>
            <span className="countdown-sep">:</span>
          </>
        )}
        <div className="countdown-unit">
          <span className="countdown-value">{pad(parts.hours)}</span>
          <span className="countdown-label">hrs</span>
        </div>
        <span className="countdown-sep">:</span>
        <div className="countdown-unit">
          <span className="countdown-value">{pad(parts.minutes)}</span>
          <span className="countdown-label">min</span>
        </div>
        <span className="countdown-sep">:</span>
        <div className="countdown-unit">
          <span className="countdown-value">{pad(parts.seconds)}</span>
          <span className="countdown-label">sec</span>
        </div>
      </div>
    </div>
  );
}
