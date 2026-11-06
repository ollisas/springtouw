# Springtouwteller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static web page for an Android phone that counts jump-rope jumps from the front camera and shows the mirrored camera image full-screen with the count over it.

**Architecture:** Plain ES modules, no build step. Two pure modules (`counter.js` turns pose landmarks into jump events, `session.js` turns jump times into count/clock/tempo/best) are unit-tested with `node --test`; `app.js` wires camera → MediaPipe Pose Landmarker → counter → session → DOM. Hosted on GitHub Pages.

**Tech Stack:** HTML/CSS/JS (ES modules), `@mediapipe/tasks-vision@1.2.2` from jsDelivr, model `pose_landmarker_lite` (float16/1) from storage.googleapis.com, Node 24 `node:test`.

**Spec:** `docs/2026-11-06-springtouw-ontwerp.md`

## Global Constraints

- All UI copy in Dutch, exactly as in the spec: "Start camera", "Opnieuw", "Beste: N", "N per min", "Ga iets verder weg staan", "Kan het herkenningsmodel niet laden. Controleer je internet."
- No camera frames stored or sent anywhere. No analytics.
- No build step, no npm dependencies at runtime; MediaPipe pinned to `1.2.2`.
- Count only when landmarks 11, 12 (shoulders), 23, 24 (hips), 27, 28 (ankles) all have `visibility >= 0.5`.
- Min 200 ms between counted jumps. Clock pause after 3000 ms without a jump. Tempo window 5000 ms.
- Best is stored in `localStorage` under key `springtouw.best`.
- Commits: `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`, explicit paths, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Breathing / swaying while standing still must not count (tiny signal, below `minRise`) — test in Task 1.
2. Walking toward or away from the phone (ankles out of view) must not count, and must not leave a half-finished jump that counts on return — test in Task 1.
3. Noisy landmarks (jitter of ±1 % of torso length per frame) must not double-count a single jump — test in Task 1.
4. Distance to camera (body twice as small in the frame) must give the same count — test in Task 1.
5. `localStorage` unavailable or holding garbage must not break the app (best falls back to 0) — test in Task 2.

---

### Task 1: Jump detector (`counter.js`)

**Files:**
- Create: `counter.js`, `test/counter.test.js`, `test/synth.js`, `package.json` (`{"type":"module","private":true,"scripts":{"test":"node --test test/"}}`)

**Interfaces:**
- Produces: `createJumpDetector(opts?) -> { push(sample) -> { jump: boolean, inView: boolean }, reset() -> void }`
  - `opts`: `{ minIntervalMs = 200, minRise = 0.03, adaptFactor = 0.35, ampWindowMs = 2000 }`
  - `sample`: `{ t: number /* ms */, landmarks: Array<{x:number,y:number,visibility:number}> | null }` (33 MediaPipe landmarks, image-normalised, y down)
- `test/synth.js` produces `makePose({ cx, hipY, scale, visible }) -> landmarks[33]` and `jumpSeries({ jumps, periodMs, heightFrac, fps, scale, noise, startMs }) -> sample[]` (sinusoid-ish hops: torso moves up by `heightFrac * torsoLength` and back each period; `noise` adds uniform jitter in torso-lengths using a seeded PRNG).

Algorithm (the tests do not fully determine it):
```
inView = all of [11,12,23,24,27,28] have visibility >= 0.5
if !inView: reset internal state (baseline = null, state = 'ground'); return {jump:false, inView:false}
torso = |mean(y11,y12) - mean(y23,y24)|
s = (mean(y11,y12) + mean(y23,y24)) / 2 / torso      // distance-independent height signal
smooth: sm = sm == null ? s : sm + 0.5*(s - sm)
baseline = baseline == null ? sm : baseline + 0.05*(sm - baseline)
keep (t, sm) for the last ampWindowMs; amp = max - min
th = max(minRise, adaptFactor * amp)
up = baseline - sm                                     // positive = body higher than baseline
ground: if up > th -> air
air:    if up < 0.3*th -> ground; if t - lastJumpT >= minIntervalMs -> lastJumpT = t, jump = true
```

- [ ] **Step 1: Write failing tests in `test/counter.test.js`** using `test/synth.js`:
  - `counts a calm series of 50 jumps` — 50 jumps, period 500 ms, heightFrac 0.08, 30 fps, preceded and followed by 1 s standing → total `jump` count is 48–50.
  - `counts a fast series` — 60 jumps, period 330 ms, heightFrac 0.06 → 58–60.
  - `does not count breathing` — 10 s standing with heightFrac 0.01 oscillation, period 3000 ms → 0.
  - `does not count while out of view` — 3 s of walking samples with ankles `visibility 0.2` and hip bobbing heightFrac 0.08 → 0 jumps and every result has `inView === false`.
  - `does not finish a jump across leaving view` — enter air phase, then 1 s out of view, then standing still 1 s → 0 jumps.
  - `ignores noise` — 30 jumps with noise 0.01 → 29–30.
  - `is distance independent` — 30 jumps at scale 0.5 and at scale 1 give the same count.
  - `never counts faster than 200 ms` — 20 jumps at period 120 ms → at most `ceil(duration/200)` and every pair of jump times is ≥ 200 ms apart.
- [ ] **Step 2: Run** `npm test` → FAIL (`counter.js` missing).
- [ ] **Step 3: Implement `createJumpDetector` in `counter.js`** per the algorithm above.
- [ ] **Step 4: Run** `npm test` → all PASS. If a threshold test fails, tune only `minRise`/`adaptFactor` defaults and note the values in the commit message.
- [ ] **Step 5: Commit** `package.json counter.js test/counter.test.js test/synth.js` — "Telregels: sprongdetector met tests".

### Task 2: Session (`session.js`)

**Files:**
- Create: `session.js`, `test/session.test.js`

**Interfaces:**
- Produces: `createSession({ pauseMs = 3000, tempoWindowMs = 5000, storage = null }) -> { addJump(t), tick(t) -> { count, elapsedMs, perMinute /* number|null */, best }, reset() }`
  - `storage` is a `localStorage`-like object (`getItem`, `setItem`); `null` or throwing → best kept in memory only.

Rules:
- `count` increments per `addJump`; `reset()` sets count and clock to 0, keeps best.
- Clock: on `addJump(t)` with a previous jump, `accumulated += min(t - lastJump, pauseMs)`. `tick(t).elapsedMs = lastJump == null ? 0 : accumulated + min(t - lastJump, pauseMs)`.
- Tempo: jumps with time `> t - tempoWindowMs`; if fewer than 2, or `t - lastJump > pauseMs` → `null`; else `Math.round((n - 1) / (last - first) * 60000)`.
- Best: on each jump `best = max(best, count)`, written as a string to `springtouw.best`; read on create with `parseInt`, invalid → 0.

- [ ] **Step 1: Write failing tests:**
  - `clock` — jumps at 0, 500, 1000: `tick(1000).elapsedMs === 1000`, `tick(2000) === 2000`, `tick(10000) === 4000`; jump at 10000 then `tick(10500).elapsedMs === 4500`.
  - `tempo` — jumps every 500 ms from 0 to 4500: `tick(4500).perMinute === 120`; `tick(8000).perMinute === null`; single jump → `null`.
  - `best persists` — fake storage; 5 jumps, `reset()`, 3 jumps → `best === 5`, `count === 3`; new session on same storage → `tick(0).best === 5`.
  - `bad storage` — storage with `'abc'` → best 0; storage whose methods throw → no exception, best still tracked in memory.
  - `reset` — after reset `tick(t)` gives `{count:0, elapsedMs:0, perMinute:null}`.
- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement `createSession` in `session.js`.**
- [ ] **Step 4: Run** `npm test` → all PASS.
- [ ] **Step 5: Commit** `session.js test/session.test.js` — "Klokje, tempo en beste reeks met tests".

### Task 3: The page (`index.html`, `style.css`, `app.js`, manifest)

**Files:**
- Create: `index.html`, `style.css`, `app.js`, `manifest.webmanifest`, `icon.svg`, `icon-192.png`, `icon-512.png`, `README.md`

**Interfaces:**
- Consumes: `createJumpDetector()` (Task 1), `createSession({ storage: localStorage })` (Task 2).

Layout (portrait, full viewport, `100dvh`): `<video>` full-cover, mirrored via `transform: scaleX(-1)`, `object-fit: cover`. Overlays: top-left clock `m:ss`, top-right `N per min` (or `– per min`), centre count (font-size `min(45vw, 35vh)`, white, `-webkit-text-stroke` black, `paint-order: stroke fill`), bottom-left `Beste: N`, bottom-right button `Opnieuw`, hint banner `Ga iets verder weg staan` when `inView` false. Start overlay with title "Springtouwteller", three-line setup instructions (telefoon rechtop, 2 à 3 meter, helemaal in beeld) and button `Start camera`; status line under it for loading/errors.

`app.js` on Start tap:
1. `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })`; on `NotAllowedError` show "Geen toegang tot de camera. Tik in Chrome op het slotje naast het adres en zet Camera op Toestaan." ; other errors show "Camera starten lukt niet: <name>".
2. Load `FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm')` and `PoseLandmarker.createFromOptions` with `runningMode: 'VIDEO'`, `numPoses: 1`, model URL above, `delegate: 'GPU'`; on failure retry with `'CPU'`; if both fail show the spec's model error text.
3. Loop with `video.requestVideoFrameCallback` (fallback `requestAnimationFrame`): `detectForVideo(video, now)` → `detector.push({ t: now, landmarks: result.landmarks[0] ?? null })` → on `jump` `session.addJump(now)`; every frame render `session.tick(now)` and the hint.
4. `navigator.wakeLock.request('screen')` after start and again on `visibilitychange` to visible; ignore failures.
5. `Opnieuw` → `session.reset()`.

README: what it is, URL, how to run tests (`npm test`), how to try locally (`npx serve .` then `http://localhost:3000`).

- [ ] **Step 1: Write the files.** Icons: a simple jump-rope figure in `icon.svg`; PNGs rendered from it with headless Edge (`msedge --headless=new --screenshot`).
- [ ] **Step 2: Verify in the Browser pane** — serve the folder on localhost (`.claude/launch.json` entry `springtouw`, `npx serve -l 5173 .`), open it: start screen visible, no console errors on load; tap `Start camera` → camera error message appears (the server has no camera). Check layout at mobile preset (375×812).
- [ ] **Step 3: Verify the model loads** — in the page console, import the bundle and create the PoseLandmarker (CPU) to prove the CDN and model URLs work; expect no error.
- [ ] **Step 4: Run** `npm test` → all PASS.
- [ ] **Step 5: Commit** all new files — "Het scherm: camera, telling en knoppen".

### Task 4: Publish on GitHub Pages

**Gate:** ask Olivier for an explicit yes before creating the public repository.

- [ ] **Step 1:** `gh repo create ollisas/springtouw --public --source . --push`.
- [ ] **Step 2:** enable Pages from `main` / root: `gh api -X POST repos/ollisas/springtouw/pages -f "source[branch]=main" -f "source[path]=/"`.
- [ ] **Step 3:** wait until `https://ollisas.github.io/springtouw/` returns 200 and open it in the Browser pane: start screen visible, no console errors.
- [ ] **Step 4:** send Olivier the link and the instructions: open in Chrome, allow the camera, "Toevoegen aan startscherm".
