// Klokje, tempo en beste reeks. Krijgt tijden binnen (ms), weet niets van camera of scherm.
const BEST_KEY = 'springtouw.best';

export function createSession({ pauseMs = 3000, tempoWindowMs = 5000, storage = null } = {}) {
  let count = 0;
  let accumulated = 0;
  let lastJump = null;
  let recent = [];
  let best = readBest();

  function readBest() {
    try {
      const n = parseInt(storage?.getItem(BEST_KEY), 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch {
      return 0;
    }
  }

  function writeBest() {
    try {
      storage?.setItem(BEST_KEY, String(best));
    } catch {
      // Opslaan lukt niet: de beste blijft dan alleen in het geheugen.
    }
  }

  function addJump(t) {
    if (lastJump !== null) accumulated += Math.min(t - lastJump, pauseMs);
    lastJump = t;
    count += 1;
    recent.push(t);
    if (count > best) {
      best = count;
      writeBest();
    }
  }

  function tick(t) {
    const elapsedMs = lastJump === null ? 0 : accumulated + Math.min(t - lastJump, pauseMs);
    recent = recent.filter((x) => x > t - tempoWindowMs);
    let perMinute = null;
    if (recent.length >= 2 && t - lastJump <= pauseMs) {
      const span = recent.at(-1) - recent[0];
      if (span > 0) perMinute = Math.round(((recent.length - 1) / span) * 60000);
    }
    return { count, elapsedMs, perMinute, best };
  }

  function reset() {
    count = 0;
    accumulated = 0;
    lastJump = null;
    recent = [];
  }

  return { addJump, tick, reset };
}
