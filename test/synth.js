// Nagebootste MediaPipe-houdingen voor de tests: 33 punten, y loopt naar beneden.
const BASE_TORSO = 0.2;

export function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// hipY: hoogte van de heupen; scale: grootte in beeld (1 = romp van 0,2 beeldhoogte).
// torsoFactor: geschatte romplengte wijkt af (zoals het echte model doet), het midden van de romp blijft staan.
export function makePose({ cx = 0.5, hipY = 0.55, scale = 1, visible = true, jitter = null, torsoFactor = 1 } = {}) {
  const torso = BASE_TORSO * scale;
  const pts = Array.from({ length: 33 }, () => ({ x: cx, y: hipY, visibility: 0.9 }));
  const set = (i, x, y) => {
    pts[i] = { x, y: y + (jitter ? jitter() * torso : 0), visibility: 0.9 };
  };
  const midY = hipY - torso / 2;
  const half = (torso * torsoFactor) / 2;
  set(11, cx - 0.2 * torso, midY - half);
  set(12, cx + 0.2 * torso, midY - half);
  set(23, cx - 0.15 * torso, midY + half);
  set(24, cx + 0.15 * torso, midY + half);
  set(27, cx - 0.15 * torso, hipY + 1.1 * torso);
  set(28, cx + 0.15 * torso, hipY + 1.1 * torso);
  if (!visible) {
    pts[27].visibility = 0.2;
    pts[28].visibility = 0.2;
  }
  return pts;
}

// Een reeks sprongen: per periode een halve sinus omhoog (heightFrac × romplengte), dan op de grond.
export function jumpSeries({
  jumps,
  periodMs = 500,
  heightFrac = 0.08,
  fps = 30,
  scale = 1,
  noise = 0,
  startMs = 0,
  standBeforeMs = 1000,
  standAfterMs = 1000,
  visible = true,
  torsoJitter = 0,
  seed = 1,
} = {}) {
  const rand = mulberry32(seed);
  const jitter = noise ? () => (rand() * 2 - 1) * noise : null;
  const torso = BASE_TORSO * scale;
  const groundHip = 0.55;
  const dt = 1000 / fps;
  const jumpMs = jumps * periodMs;
  const total = standBeforeMs + jumpMs + standAfterMs;
  const samples = [];
  for (let k = 0; k * dt <= total; k++) {
    const local = k * dt;
    let rise = 0;
    const inJump = local - standBeforeMs;
    if (inJump >= 0 && inJump < jumpMs) {
      const phase = (inJump % periodMs) / periodMs;
      if (phase < 0.5) rise = heightFrac * torso * Math.sin(Math.PI * phase * 2);
    }
    samples.push({
      t: startMs + local,
      landmarks: makePose({
        hipY: groundHip - rise,
        scale,
        visible,
        jitter,
        torsoFactor: 1 + (rand() * 2 - 1) * torsoJitter,
      }),
    });
  }
  return samples;
}
