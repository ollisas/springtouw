// Telregels: zet MediaPipe-lichaamspunten om in sprongen. Geen camera, geen scherm: alleen getallen.
const NEEDED = [11, 12, 23, 24, 27, 28]; // schouders, heupen, enkels
const MIN_VISIBILITY = 0.5;

export function createJumpDetector({
  minIntervalMs = 200,
  minRise = 0.02,
  adaptFactor = 0.35,
  ampWindowMs = 2000,
} = {}) {
  let sm = null;
  let baseline = null;
  let state = 'ground';
  let lastJumpT = -Infinity;
  let history = [];

  function reset() {
    sm = null;
    baseline = null;
    state = 'ground';
    history = [];
  }

  function inView(lm) {
    return Array.isArray(lm) && NEEDED.every((i) => lm[i] && lm[i].visibility >= MIN_VISIBILITY);
  }

  function push({ t, landmarks }) {
    if (!inView(landmarks)) {
      reset();
      return { jump: false, inView: false };
    }
    const shoulderY = (landmarks[11].y + landmarks[12].y) / 2;
    const hipY = (landmarks[23].y + landmarks[24].y) / 2;
    const torso = Math.abs(hipY - shoulderY);
    if (torso < 1e-6) return { jump: false, inView: true };

    const s = (shoulderY + hipY) / 2 / torso;
    sm = sm === null ? s : sm + 0.5 * (s - sm);
    baseline = baseline === null ? sm : baseline + 0.05 * (sm - baseline);

    history.push({ t, v: sm });
    while (history.length && history[0].t < t - ampWindowMs) history.shift();
    let lo = Infinity;
    let hi = -Infinity;
    for (const h of history) {
      if (h.v < lo) lo = h.v;
      if (h.v > hi) hi = h.v;
    }
    const th = Math.max(minRise, adaptFactor * (hi - lo));
    const up = baseline - sm;

    let jump = false;
    if (state === 'ground') {
      if (up > th) state = 'air';
    } else if (up < 0.3 * th) {
      state = 'ground';
      if (t - lastJumpT >= minIntervalMs) {
        lastJumpT = t;
        jump = true;
      }
    }
    return { jump, inView: true };
  }

  return { push, reset };
}
