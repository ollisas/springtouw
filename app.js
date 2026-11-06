// Springtouwteller: camera -> MediaPipe lichaamsherkenning -> telregels -> scherm.
import { createJumpDetector } from './counter.js';
import { createSession } from './session.js';
import { cameraErrorMessage } from './messages.js';

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
let running = false;
let loopGen = 0; // elke start krijgt een eigen lus; een oude lus stopt vanzelf
let errorsInARow = 0;

ui.go.addEventListener('click', start);
ui.reset.addEventListener('click', () => {
  session.reset();
  detector.reset();
  render(performance.now(), true);
});
document.addEventListener('visibilitychange', () => {
  if (!running) return;
  if (document.visibilityState === 'hidden') {
    detector.reset(); // een half gemeten sprong van voor de onderbreking telt niet mee
  } else {
    keepScreenOn();
    if (video.paused) video.play().catch(() => {});
  }
});

async function start() {
  ui.go.disabled = true;
  try {
    setStatus('Camera starten…');
    await startCamera();
    setStatus('Herkenning laden… (de eerste keer duurt dit even)');
    landmarker ??= await loadLandmarker();
    ui.start.hidden = true;
    ui.hud.hidden = false;
    setStatus('');
    keepScreenOn();
    render(performance.now(), true);
    running = true;
    loop(++loopGen);
  } catch (err) {
    setStatus(err.message);
    ui.go.disabled = false;
  }
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Deze pagina heeft een beveiligde verbinding (https) nodig om de camera te gebruiken.');
  }
  const old = video.srcObject;
  if (old && old.getVideoTracks().some((tr) => tr.readyState === 'live')) {
    await video.play();
    return; // camera loopt nog (bijvoorbeeld na een mislukte modelstart): opnieuw gebruiken
  }
  old?.getTracks().forEach((tr) => tr.stop());
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      audio: false,
    });
  } catch (err) {
    throw new Error(cameraErrorMessage(err));
  }
  stream.getVideoTracks().forEach((tr) => tr.addEventListener('ended', cameraStopped));
  video.srcObject = stream;
  await video.play();
}

async function loadLandmarker(delegates = ['GPU', 'CPU']) {
  try {
    const { FilesetResolver, PoseLandmarker } = await import(`${MP_BASE}/vision_bundle.mjs`);
    const fileset = await FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
    const make = (delegate) =>
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
    for (const [i, delegate] of delegates.entries()) {
      try {
        return await make(delegate);
      } catch (err) {
        if (i === delegates.length - 1) throw err;
      }
    }
  } catch {
    throw new Error('Kan het herkenningsmodel niet laden. Controleer je internet.');
  }
}

function loop(gen) {
  let lastVideoTime = -1;
  const step = () => {
    if (gen !== loopGen) return;
    const now = performance.now();
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      try {
        const result = landmarker.detectForVideo(video, now);
        errorsInARow = 0;
        const { jump, inView } = detector.push({ t: now, landmarks: result.landmarks?.[0] ?? null });
        if (jump) session.addJump(now);
        ui.hint.hidden = inView;
      } catch (err) {
        detectFailed(err);
      }
    }
    render(now);
    schedule();
  };
  const schedule = () =>
    video.requestVideoFrameCallback ? video.requestVideoFrameCallback(step) : requestAnimationFrame(step);
  schedule();
}

// Herkenning gaat mis (bijvoorbeeld de grafische chip na het wisselen van app): na een paar keer
// overstappen op de gewone processor. De lus blijft altijd doorlopen.
let switching = false;
function detectFailed(err) {
  errorsInARow += 1;
  if (errorsInARow < 5 || switching) return;
  switching = true;
  console.warn('Herkenning faalt, overstappen op CPU', err);
  loadLandmarker(['CPU'])
    .then((lm) => {
      landmarker?.close?.();
      landmarker = lm;
      errorsInARow = 0;
    })
    .catch(() => {
      landmarker = null;
      cameraStopped('De herkenning werkt niet meer. Tik op Start camera om opnieuw te beginnen.');
    })
    .finally(() => {
      switching = false;
    });
}

// Camera weg (andere app nam hem over, of de herkenning werkt niet meer): terug naar het startscherm.
function cameraStopped(message) {
  running = false;
  loopGen += 1;
  ui.hud.hidden = true;
  ui.start.hidden = false;
  ui.go.disabled = false;
  detector.reset();
  setStatus(typeof message === 'string' ? message : 'De camera is gestopt. Tik op Start camera om verder te gaan.');
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
