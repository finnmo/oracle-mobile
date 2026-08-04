import { useEffect, useRef, useState, useCallback } from 'react';
import { Pub } from '../types';

interface Props {
  finalPub: Pub;
  allPubNames: string[];
  onComplete: () => void;
}

export default function SlotReveal({ finalPub, allPubNames, onComplete }: Props) {
  const [displayName, setDisplayName] = useState('');
  const [done, setDone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishedRef = useRef(false);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    setDisplayName(finalPub.name);
    setDone(true);
    completeTimerRef.current = setTimeout(onComplete, 400);
  }, [finalPub.name, onComplete]);

  useEffect(() => {
    const names = [...allPubNames].sort(() => Math.random() - 0.5);
    if (!names.includes(finalPub.name)) names.push(finalPub.name);

    let idx = 0;
    let delay = 70;
    const totalDuration = 3000;
    const start = Date.now();

    function tick() {
      if (finishedRef.current) return;
      const elapsed = Date.now() - start;

      if (elapsed >= totalDuration) {
        finish();
        return;
      }

      setDisplayName(names[idx % names.length]);
      idx++;

      const progress = elapsed / totalDuration;
      delay = 70 + progress * progress * 260;
      timerRef.current = setTimeout(tick, delay);
    }

    tick();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
    };
  }, [finalPub, allPubNames, finish]);

  return (
    <div
      className="card slot-reveal"
      role="button"
      tabIndex={0}
      aria-label={done ? finalPub.name : 'Revealing pub — tap to skip'}
      onClick={() => { if (!done) finish(); }}
      onKeyDown={(e) => {
        if (!done && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          finish();
        }
      }}
    >
      <div className="card-label">Hey — we&apos;re going to</div>
      <div className="slot-reveal-window">
        <h2 className={`pub-name slot-reveal-name ${done ? 'slot-reveal-name--final' : ''}`}>
          {displayName}
        </h2>
      </div>
      {!done && <p className="slot-skip-hint">Tap to skip</p>}
    </div>
  );
}
