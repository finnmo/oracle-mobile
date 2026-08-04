import { useEffect, useRef, useState, useCallback } from 'react';
import { Pub } from '../types';
import { BenchIcon } from './PubIcons';

interface Props {
  finalPub: Pub;
  allPubNames: string[];
  onComplete: () => void;
}

type Phase = 'intro' | 'spinning' | 'landed';

export default function SlotReveal({ finalPub, allPubNames, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [displayName, setDisplayName] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishedRef = useRef(false);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    setDisplayName(finalPub.name);
    setPhase('landed');
    completeTimerRef.current = setTimeout(onComplete, 900);
  }, [finalPub.name, onComplete]);

  // Intro beat, then spin
  useEffect(() => {
    const t = setTimeout(() => setPhase('spinning'), 1100);
    return () => clearTimeout(t);
  }, []);

  // Name reel
  useEffect(() => {
    if (phase !== 'spinning') return;

    const names = [...allPubNames].sort(() => Math.random() - 0.5);
    if (!names.includes(finalPub.name)) names.push(finalPub.name);
    // Guarantee final name isn't sitting near the start of the shuffle
    const pool = names.filter((n) => n !== finalPub.name);
    while (pool.length < 8) pool.push(...names);
    const sequence = [...pool.slice(0, 14), finalPub.name];

    let idx = 0;
    let delay = 55;
    const totalDuration = 3400;
    const start = Date.now();

    function tick() {
      if (finishedRef.current) return;
      const elapsed = Date.now() - start;

      if (elapsed >= totalDuration || idx >= sequence.length - 1) {
        finish();
        return;
      }

      setDisplayName(sequence[idx % sequence.length]);
      idx++;

      const progress = elapsed / totalDuration;
      // ease out: fast blur → slow suspense
      delay = 55 + progress * progress * 420;
      timerRef.current = setTimeout(tick, delay);
    }

    tick();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase, finalPub, allPubNames, finish]);

  useEffect(() => {
    return () => {
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
    };
  }, []);

  const skip = () => {
    if (phase !== 'landed') finish();
  };

  return (
    <div
      className={`announce-reveal announce-reveal--${phase}`}
      role="button"
      tabIndex={0}
      aria-label={phase === 'landed' ? finalPub.name : 'Revealing pub — tap to skip'}
      aria-live="polite"
      onClick={skip}
      onKeyDown={(e) => {
        if (phase !== 'landed' && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          skip();
        }
      }}
    >
      <div className="announce-reveal-glow" aria-hidden="true" />

      <p className="announce-reveal-eyebrow">
        {phase === 'intro' && 'The Oracle has spoken'}
        {phase === 'spinning' && 'Choosing this week’s pub…'}
        {phase === 'landed' && 'Hey — we’re going to'}
      </p>

      <div className="announce-reveal-reel" aria-hidden={phase === 'intro'}>
        <div className="announce-reveal-mask">
          {phase === 'intro' ? (
            <BenchIcon className="announce-reveal-mark" />
          ) : (
            <h2
              className={`announce-reveal-name ${phase === 'landed' ? 'announce-reveal-name--final' : ''}`}
              key={phase === 'landed' ? 'final' : displayName}
            >
              {displayName || '…'}
            </h2>
          )}
        </div>
      </div>

      {phase === 'landed' && finalPub.address && (
        <p className="announce-reveal-address">{finalPub.address}</p>
      )}

      {phase !== 'landed' && <p className="announce-reveal-skip">Tap to skip</p>}
    </div>
  );
}
