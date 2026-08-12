import { useEffect, useRef, useState, useCallback } from 'react';
import { Pub } from '../types';
import { BrandIcon } from './BrandIcon';
import { useBranding } from '../context/BrandingContext';

interface Props {
  finalPub: Pub;
  allPubNames: string[];
  onComplete: () => void;
  /** Skip the intro beat when we already built suspense with "thinking". */
  skipIntro?: boolean;
}

type Phase = 'intro' | 'spinning' | 'landed';

export default function SlotReveal({ finalPub, allPubNames, onComplete, skipIntro = false }: Props) {
  const { branding } = useBranding();
  const title = branding.title;
  const [phase, setPhase] = useState<Phase>(skipIntro ? 'spinning' : 'intro');
  const [displayName, setDisplayName] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const finalName = finalPub.name;

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    setDisplayName(finalName);
    setPhase('landed');
    completeTimerRef.current = setTimeout(() => onCompleteRef.current(), 900);
  }, [finalName]);

  // Intro beat, then spin (unless skipIntro)
  useEffect(() => {
    if (skipIntro) return;
    const t = setTimeout(() => setPhase('spinning'), 1100);
    return () => clearTimeout(t);
  }, [skipIntro]);

  // Name reel — stable deps so SSE status churn won't restart mid-spin
  useEffect(() => {
    if (phase !== 'spinning') return;

    const names = [...allPubNames].sort(() => Math.random() - 0.5);
    if (!names.includes(finalName)) names.push(finalName);
    const pool = names.filter((n) => n !== finalName);
    while (pool.length < 8) pool.push(...names);
    const sequence = [...pool.slice(0, 14), finalName];

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
      delay = 55 + progress * progress * 420;
      timerRef.current = setTimeout(tick, delay);
    }

    tick();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase, finalName, allPubNames, finish]);

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
      aria-label={phase === 'landed' ? finalName : 'Revealing pub — tap to skip'}
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
        {phase === 'intro' && `${title} has spoken`}
        {phase === 'spinning' && 'Choosing this week’s pick…'}
        {phase === 'landed' && 'This week we’re going to'}
      </p>

      <div className="announce-reveal-reel" aria-hidden={phase === 'intro'}>
        <div className="announce-reveal-mask">
          {phase === 'intro' ? (
            <BrandIcon className="announce-reveal-mark" branding={branding} />
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
