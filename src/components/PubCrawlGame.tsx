import { useEffect, useRef } from 'react';

// Canvas coordinate space — CSS scales it to fill the container
const CW = 560;
const CH = 175;
const GROUND = 140;
const CHAR_X = 60;

// Floaty dino-style jump: slow up, slow down
const JUMP_V   = -8;
const GRAVITY  = 0.36;
const BASE_SPD = 2;
const HS_KEY   = 'oracle_pub_crawl_hs';

type OType = 'pint' | 'stool' | 'taxi';
const SIZES: Record<OType, [number, number]> = {
  pint:  [17, 36],
  stool: [22, 24],
  taxi:  [48, 26],
};
const TYPES: OType[] = ['pint', 'stool'];

interface Obs  { x: number; type: OType }
interface Sign { x: number; name: string }

export default function PubCrawlGame({ pubs, onClose }: { pubs: string[]; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const jumpRef   = useRef<() => void>(() => {});
  const closeRef  = useRef(onClose);
  const pubsRef   = useRef(pubs);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => { pubsRef.current = pubs; });

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx    = canvas.getContext('2d')!;

    const s = {
      running: false, dead: false,
      score: 0, hs: parseInt(localStorage.getItem(HS_KEY) ?? '0', 10),
      charY: GROUND, velY: 0, onGround: true,
      obstacles: [] as Obs[],
      signs: pubsRef.current.slice(0, 4).map((name, i) => ({ name, x: 120 + i * 160 })) as Sign[],
      speed: BASE_SPD,
      walkFrame: 0, walkTimer: 0,
      nextObs: 260, pubIdx: Math.min(pubsRef.current.length, 4),
      lastType: null as OType | null,
      rafId: 0,
    };

    function render() {
      // Background
      ctx.fillStyle = '#fdf6e3';
      ctx.fillRect(0, 0, CW, CH);

      // Ground line
      ctx.fillStyle = '#c8a96e';
      ctx.fillRect(0, GROUND + 1, CW, 2);
      ctx.fillStyle = '#e8d5b0';
      ctx.fillRect(0, GROUND + 3, CW, CH - GROUND - 3);

      // Pub name signs — just text on a simple stake, no fussy decoration
      for (const sg of s.signs) {
        if (sg.x < -120 || sg.x > CW + 10) continue;
        ctx.fillStyle = '#b8956a';
        ctx.fillRect(sg.x + 8, GROUND - 44, 2, 46);
        ctx.fillStyle = '#f0c060';
        const label = sg.name.length > 13 ? sg.name.slice(0, 12) + '…' : sg.name;
        const bw = Math.max(48, label.length * 6 + 10);
        ctx.fillRect(sg.x, GROUND - 52, bw, 14);
        ctx.fillStyle = '#5c3d11';
        ctx.font = '7px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(label, sg.x + 4, GROUND - 41);
      }

      // Character
      const cy = s.charY;
      ctx.fillStyle = '#1a2e4a';
      // head
      ctx.beginPath(); ctx.arc(CHAR_X, cy - 34, 7, 0, Math.PI * 2); ctx.fill();
      // body
      ctx.fillRect(CHAR_X - 5, cy - 27, 10, 14);
      // legs (2-frame walk, or tucked when airborne)
      ctx.strokeStyle = '#1a2e4a'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      if (!s.onGround) {
        ctx.beginPath(); ctx.moveTo(CHAR_X - 2, cy - 14); ctx.lineTo(CHAR_X - 4, cy - 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(CHAR_X + 2, cy - 14); ctx.lineTo(CHAR_X + 4, cy - 7); ctx.stroke();
      } else if (s.walkFrame === 0) {
        ctx.beginPath(); ctx.moveTo(CHAR_X - 2, cy - 14); ctx.lineTo(CHAR_X - 5, cy);     ctx.stroke();
        ctx.beginPath(); ctx.moveTo(CHAR_X + 2, cy - 14); ctx.lineTo(CHAR_X + 4, cy - 5); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(CHAR_X - 2, cy - 14); ctx.lineTo(CHAR_X - 3, cy - 5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(CHAR_X + 2, cy - 14); ctx.lineTo(CHAR_X + 5, cy);     ctx.stroke();
      }

      // Obstacles — simple silhouette shapes, same dark colour as the character
      ctx.fillStyle = '#1a2e4a';
      for (const obs of s.obstacles) {
        if (obs.x < -60 || obs.x > CW + 20) continue;
        const [w, h] = SIZES[obs.type];
        if (obs.type === 'pint') {
          const gx = obs.x, gy = GROUND - h;
          // Pint glass: wide mouth at top, narrow base
          const tL = gx - 2, tR = gx + w + 2;   // top (wide)
          const bL = gx + 3, bR = gx + w - 3;   // bottom (narrow)
          // Beer fill
          ctx.fillStyle = '#d97706';
          ctx.beginPath();
          ctx.moveTo(tL + 1, gy + 9);
          ctx.lineTo(tR - 1, gy + 9);
          ctx.lineTo(bR,     GROUND - 1);
          ctx.lineTo(bL,     GROUND - 1);
          ctx.closePath(); ctx.fill();
          // Foam
          ctx.fillStyle = '#fffbf0';
          ctx.beginPath();
          ctx.ellipse(gx + w / 2, gy + 6, (tR - tL) / 2 - 1, 5, 0, 0, Math.PI * 2);
          ctx.fill();
          // Glass outline
          ctx.strokeStyle = '#1a2e4a'; ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(tL, gy);
          ctx.lineTo(tR, gy);
          ctx.lineTo(bR, GROUND - 1);
          ctx.lineTo(bL, GROUND - 1);
          ctx.closePath(); ctx.stroke();
          ctx.fillStyle = '#1a2e4a';
        } else if (obs.type === 'stool') {
          // Seat
          ctx.fillRect(obs.x, GROUND - h, w, 4);
          // Two legs
          ctx.fillRect(obs.x + 3, GROUND - h + 4, 3, h - 4);
          ctx.fillRect(obs.x + w - 6, GROUND - h + 4, 3, h - 4);
          // Foot bar
          ctx.fillRect(obs.x + 1, GROUND - Math.floor(h / 2), w - 2, 2);
        } else {
          // Taxi: boxy body + cabin on top
          ctx.fillRect(obs.x, GROUND - h, w, h);
          ctx.fillStyle = '#2d4a6b';
          ctx.fillRect(obs.x + 8, GROUND - h - 9, w - 16, 10);
          ctx.fillStyle = '#1a2e4a';
          // Wheel wells (negative space)
          ctx.fillStyle = '#e8d5b0';
          ctx.beginPath(); ctx.arc(obs.x + 10, GROUND, 5, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(obs.x + w - 10, GROUND, 5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#1a2e4a';
        }
      }

      // Score
      ctx.textAlign = 'right';
      ctx.fillStyle = '#8a6a3a';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`${Math.floor(s.score)}m`, CW - 8, 16);
      if (s.hs > 0) {
        ctx.fillStyle = '#b89a6a';
        ctx.font = '9px monospace';
        ctx.fillText(`best ${s.hs}m`, CW - 8, 27);
      }

      // State overlays
      if (!s.running && !s.dead) {
        ctx.fillStyle = 'rgba(253,246,227,0.82)';
        ctx.fillRect(0, 0, CW, CH);
        ctx.fillStyle = '#1a2e4a';
        ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center';
        ctx.fillText('PUB CRAWL', CW / 2, CH / 2 - 8);
        ctx.font = '10px monospace'; ctx.fillStyle = '#8a6a3a';
        ctx.fillText('tap or space to start', CW / 2, CH / 2 + 10);
      } else if (s.dead) {
        ctx.fillStyle = 'rgba(253,246,227,0.82)';
        ctx.fillRect(0, 0, CW, CH);
        ctx.fillStyle = '#1a2e4a';
        ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
        ctx.fillText('KICKED OUT', CW / 2, CH / 2 - 10);
        ctx.font = '10px monospace'; ctx.fillStyle = '#8a6a3a';
        ctx.fillText(`${Math.floor(s.score)}m  ·  best ${s.hs}m`, CW / 2, CH / 2 + 7);
        ctx.font = '9px monospace'; ctx.fillStyle = '#b89a6a';
        ctx.fillText('tap or space to try again', CW / 2, CH / 2 + 21);
      }
    }

    function loop() {
      if (!s.running) return;

      // Physics — floaty arc
      if (!s.onGround) {
        s.velY  += GRAVITY;
        s.charY += s.velY;
        if (s.charY >= GROUND) { s.charY = GROUND; s.velY = 0; s.onGround = true; }
      }

      // Walk animation
      if (s.onGround && ++s.walkTimer > 9) { s.walkFrame ^= 1; s.walkTimer = 0; }

      // Speed ramp: slow start (2) → fast (8) over ~600m, eases in gradually
      s.speed  = BASE_SPD + Math.min(Math.pow(s.score / 180, 1.3), 6);
      s.score += s.speed / 60;

      // Obstacles — generous gaps
      if ((s.nextObs -= s.speed) <= 0) {
        let type: OType;
        type = TYPES[Math.floor(Math.random() * TYPES.length)];
        s.lastType = type;
        s.obstacles.push({ x: CW + 10, type });
        s.nextObs = 200 + Math.random() * 220;  // 200–420px gaps
      }
      for (const o of s.obstacles) o.x -= s.speed;
      s.obstacles = s.obstacles.filter(o => o.x > -60);

      // Signs (slow parallax)
      for (const sg of s.signs) sg.x -= s.speed * 0.28;
      s.signs = s.signs.filter(sg => sg.x > -130);
      if (!s.signs.length || s.signs[s.signs.length - 1].x < CW - 170) {
        const name = pubsRef.current.length ? pubsRef.current[s.pubIdx % pubsRef.current.length] : 'The Local';
        s.pubIdx++;
        s.signs.push({ x: CW + 10, name });
      }

      // Collision (4px forgiveness)
      const PAD = 4;
      for (const o of s.obstacles) {
        const [ow, oh] = SIZES[o.type];
        if (
          CHAR_X + 5 - PAD > o.x + PAD &&
          CHAR_X - 5 + PAD < o.x + ow - PAD &&
          s.charY      - PAD > GROUND - oh &&
          s.charY - 34 + PAD < GROUND
        ) {
          s.running = false; s.dead = true;
          if (Math.floor(s.score) > s.hs) {
            s.hs = Math.floor(s.score);
            localStorage.setItem(HS_KEY, String(s.hs));
          }
          render(); return;
        }
      }

      render();
      s.rafId = requestAnimationFrame(loop);
    }

    function startGame() {
      cancelAnimationFrame(s.rafId);
      Object.assign(s, {
        running: true, dead: false, score: 0,
        charY: GROUND, velY: 0, onGround: true,
        obstacles: [], speed: BASE_SPD,
        walkFrame: 0, walkTimer: 0, nextObs: 260, lastType: null,
        signs: pubsRef.current.slice(0, 4).map((name, i) => ({ name, x: 120 + i * 160 })),
        pubIdx: Math.min(pubsRef.current.length, 4),
      });
      s.rafId = requestAnimationFrame(loop);
    }

    function jump() {
      if (!s.running || s.dead) { startGame(); return; }
      if (s.onGround) { s.velY = JUMP_V; s.onGround = false; }
    }

    jumpRef.current = jump;
    render();

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); jump(); }
      if (e.code === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); cancelAnimationFrame(s.rafId); };
  }, []);

  return (
    <div className="card game-reveal" style={{ padding: 0, overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        width={CW}
        height={CH}
        style={{ display: 'block', width: '100%', height: 'auto', cursor: 'pointer' }}
        onClick={() => jumpRef.current()}
      />
    </div>
  );
}
