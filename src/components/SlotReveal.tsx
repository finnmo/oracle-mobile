import { useEffect, useRef, useState } from 'react';
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

  useEffect(() => {
    const names = [...allPubNames].sort(() => Math.random() - 0.5);
    if (!names.includes(finalPub.name)) names.push(finalPub.name);

    let idx = 0;
    let delay = 70;
    const totalDuration = 3000;
    const start = Date.now();

    function tick() {
      const elapsed = Date.now() - start;

      if (elapsed >= totalDuration) {
        setDisplayName(finalPub.name);
        setDone(true);
        setTimeout(onComplete, 400);
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
    };
  }, [finalPub, allPubNames, onComplete]);

  return (
    <div className="card slot-reveal">
      <div className="card-label">Hey — we&apos;re going to</div>
      <div className="slot-reveal-window">
        <h2 className={`pub-name slot-reveal-name ${done ? 'slot-reveal-name--final' : ''}`}>
          {displayName}
        </h2>
      </div>
    </div>
  );
}
