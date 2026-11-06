// Telregels: zet MediaPipe-lichaamspunten om in sprongen. Geen camera, geen scherm: alleen getallen.
const NEEDED = [11, 12, 23, 24, 27, 28]; // schouders, heupen, enkels
const MIN_VISIBILITY = 0.5;

// Afvlakking in tijd (ms) in plaats van per beeldje, zodat 15 en 30 beeldjes per seconde hetzelfde tellen.
const TAU_SIGNAL = 48;
const TAU_BASELINE = 650;
const TAU_TORSO_FAST = 100;

export function createJumpDetector({
  minIntervalMs = 200,
  minRise = 0.02,
  adaptFactor = 0.35,
  ampWindowMs = 2000,
  dropoutMs = 400, // zo lang mag iemand even "weg" zijn (touw voor de voeten) zonder dat de telling vergeet
  steadyWindowMs = 1000,
  maxScaleChange = 1.1, // grootte in beeld verandert meer dan 10 % binnen een seconde = lopen
} = {}) {
  let prevT = null;
  let sm = null;
  let baseline = null;
  let torsoRef = null;
  let torsoFast = null;
  let state = 'ground';
  let lastJumpT = -Infinity;
  let lastSeenT = null;
  let firstSeenT = null;
  let history = [];
  let torsoHistory = [];

  function reset() {
    prevT = null;
    sm = null;
    baseline = null;
    torsoRef = null;
    torsoFast = null;
    state = 'ground';
    lastSeenT = null;
    firstSeenT = null;
    history = [];
    torsoHistory = [];
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

  const ease = (prev, value, dt, tau) => (prev === null ? value : prev + (1 - Math.exp(-dt / tau)) * (value - prev));

  function windowed(list, t, value, windowMs) {
    list.push({ t, v: value });
    while (list.length && list[0].t < t - windowMs) list.shift();
    let lo = Infinity;
    let hi = -Infinity;
    for (const h of list) {
      if (h.v < lo) lo = h.v;
      if (h.v > hi) hi = h.v;
    }
    return { lo, hi };
  }

  function push({ t, landmarks }) {
    if (!inView(landmarks)) {
      if (lastSeenT !== null && t - lastSeenT < dropoutMs) return { jump: false, inView: true };
      reset();
      return { jump: false, inView: false };
    }
    const shoulderY = (landmarks[11].y + landmarks[12].y) / 2;
    const hipY = (landmarks[23].y + landmarks[24].y) / 2;
    const torso = Math.abs(hipY - shoulderY);
    if (torso < 1e-6) return { jump: false, inView: true };
    lastSeenT = t;
    if (firstSeenT === null) firstSeenT = t;

    const dt = prevT === null ? 33 : Math.min(Math.max(t - prevT, 1), 500);
    prevT = t;

    // Het model schat de romplengte per beeldje wisselend; gebruik een rustig gemiddelde, en deel alleen
    // de verandering in hoogte erdoor (niet de hoogte zelf), anders wordt die wisseling "beweging".
    torsoRef = ease(torsoRef, torso, dt, TAU_BASELINE);
    torsoFast = ease(torsoFast, torso, dt, TAU_TORSO_FAST);
    const y = (shoulderY + hipY) / 2;
    sm = ease(sm, y, dt, TAU_SIGNAL);

    // Lopen naar of van de telefoon: de grootte in beeld verandert duidelijk. Dan niet tellen.
    // De eerste seconde na verschijnen ook niet: dan is nog niet te zien of iemand stilstaat of loopt.
    const size = windowed(torsoHistory, t, torsoFast, steadyWindowMs);
    if (t - firstSeenT < steadyWindowMs || size.hi / size.lo > maxScaleChange) {
      baseline = sm;
      torsoRef = torsoFast;
      state = 'ground';
      history = [];
      return { jump: false, inView: true };
    }

    baseline = ease(baseline, sm, dt, TAU_BASELINE);
    const up = (baseline - sm) / torsoRef; // positief = lichaam hoger dan normaal, in romplengtes
    const amp = windowed(history, t, up, ampWindowMs);
    const th = Math.max(minRise, adaptFactor * (amp.hi - amp.lo));

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
