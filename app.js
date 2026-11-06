// Springtouwteller: camera -> MediaPipe lichaamsherkenning -> telregels -> scherm.
import { createJumpDetector } from './counter.js';
import { createSession } from './session.js';

const MP_VERSION = '1.2.2';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

const $ = (id) => document.getElementById(id);
const video = $('video');
const ui = {
  start: $('start'),
  go: $('go'),
  status: $('status'),
  hud: $('hud'),
  clock: $('clock'),
  tempo: $('tempo'),
  count: $('count'),
  best: $('best'),
  hint: $('hint'),
  reset: $('reset'),
};

let storage = null;
try {
  storage = window.localStorage;
} catch {
  storage = null;
}

const detector = createJumpDetector();
const session = createSession({ storage });
let landmarker = null;
let wakeLock = null;

ui.go.addEventListener('click', start);
ui.reset.addEventListener('click', () => {
  session.reset();
  render(performance.now(), true);
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && landmarker) keepScreenOn();
});

async function start() {
  ui.go.disabled = true;
  try {
    setStatus('Camera starten…');
    await startCamera();
    setStatus('Herkenning laden… (de eerste keer duurt dit even)');
    landmarker = await loadLandmarker();
    ui.start.hidden = true;
    ui.hud.hidden = false;
    keepScreenOn();
    render(performance.now(), true);
    loop();
  } catch (err) {
    setStatus(err.message);
    ui.go.disabled = false;
  }
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Deze pagina heeft een beveiligde verbinding (https) nodig om de camera te gebruiken.');
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      throw new Error(
        'Geen toegang tot de camera. Tik in Chrome op het slotje naast het adres en zet Camera op Toestaan.',
      );
    }
    throw new Error(`Camera starten lukt niet: ${err.name}`);
  }
  video.srcObject = stream;
  await video.play();
}

async function loadLandmarker() {
  try {
    const { FilesetResolver, PoseLandmarker } = await import(`${MP_BASE}/vision_bundle.mjs`);
    const fileset = await FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
    const make = (delegate) =>
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
    try {
      return await make('GPU');
    } catch {
      return await make('CPU');
    }
  } catch {
    throw new Error('Kan het herkenningsmodel niet laden. Controleer je internet.');
  }
}

function loop() {
  let lastVideoTime = -1;
  const step = () => {
    const now = performance.now();
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const result = landmarker.detectForVideo(video, now);
      const { jump, inView } = detector.push({ t: now, landmarks: result.landmarks?.[0] ?? null });
      if (jump) session.addJump(now);
      ui.hint.hidden = inView;
    }
    render(now);
    schedule();
  };
  const schedule = () =>
    video.requestVideoFrameCallback ? video.requestVideoFrameCallback(step) : requestAnimationFrame(step);
  schedule();
}

const shown = {};
function show(el, key, text) {
  if (shown[key] !== text) {
    shown[key] = text;
    el.textContent = text;
  }
}

function render(now, force = false) {
  if (force) for (const k of Object.keys(shown)) delete shown[k];
  const { count, elapsedMs, perMinute, best } = session.tick(now);
  const secs = Math.floor(elapsedMs / 1000);
  show(ui.count, 'count', String(count));
  show(ui.clock, 'clock', `⏱ ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
  show(ui.tempo, 'tempo', `${perMinute ?? '–'} per min`);
  show(ui.best, 'best', `Beste: ${best}`);
}

async function keepScreenOn() {
  try {
    if (wakeLock && !wakeLock.released) return;
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch {
    // Scherm aan houden lukt niet; de app werkt verder gewoon.
  }
}

function setStatus(text) {
  ui.status.textContent = text;
}
