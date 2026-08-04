import confetti from 'canvas-confetti';

const COLORS = ['#1a4538', '#e8d4b8', '#c4a574', '#f7f3ea', '#6b8f7a', '#0f2e26', '#d4b896'];

/** Multi-burst celebration for pub announce — forest / cream palette. */
export function fireAnnounceCelebration(): void {
  const defaults = { colors: COLORS, disableForReducedMotion: true };

  confetti({
    ...defaults,
    particleCount: 80,
    spread: 70,
    startVelocity: 45,
    origin: { x: 0.5, y: 0.45 },
  });

  window.setTimeout(() => {
    confetti({
      ...defaults,
      particleCount: 55,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.65 },
    });
    confetti({
      ...defaults,
      particleCount: 55,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.65 },
    });
  }, 220);

  window.setTimeout(() => {
    confetti({
      ...defaults,
      particleCount: 100,
      spread: 100,
      startVelocity: 35,
      scalar: 1.1,
      origin: { x: 0.5, y: 0.35 },
    });
  }, 480);

  // soft drifting “petals”
  window.setTimeout(() => {
    confetti({
      ...defaults,
      particleCount: 40,
      spread: 120,
      startVelocity: 18,
      gravity: 0.65,
      ticks: 220,
      scalar: 0.9,
      origin: { x: 0.5, y: 0.2 },
    });
  }, 700);
}
