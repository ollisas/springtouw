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
  let torsoRef = null;
  let state = 'ground';
  let lastJumpT = -Infinity;
  let history = [];

  function reset() {
    sm = null;
    baseline = null;
    torsoRef = null;
    state = 'ground';
    history = [];
  }

  function inView(lm) {
    // Zonder visibility-waarde telt een punt als zichtbaar; een punt buiten het beeld nooit.
    return (
      Array.isArray(lm) &&
      NEEDED.every((i) => {
        const p = lm[i];
        return p && (p.visibility ?? 1) >= MIN_VISIBILITY && p.y >= 0 && p.y <= 1 && p.x >= 0 && p.x <= 1;
      })
    );
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

    // Het model schat de romplengte per beeldje wisselend; gebruik een rustig gemiddelde, en deel alleen
    // de verandering in hoogte erdoor (niet de hoogte zelf), anders wordt die wisseling "beweging".
    torsoRef = torsoRef === null ? torso : torsoRef + 0.05 * (torso - torsoRef);
    const y = (shoulderY + hipY) / 2;
    sm = sm === null ? y : sm + 0.5 * (y - sm);
    baseline = baseline === null ? sm : baseline + 0.05 * (sm - baseline);
    const up = (baseline - sm) / torsoRef; // positief = lichaam hoger dan normaal, in romplengtes

    history.push({ t, v: up });
    while (history.length && history[0].t < t - ampWindowMs) history.shift();
    let lo = Infinity;
    let hi = -Infinity;
    for (const h of history) {
      if (h.v < lo) lo = h.v;
      if (h.v > hi) hi = h.v;
    }
    const th = Math.max(minRise, adaptFactor * (hi - lo));

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
