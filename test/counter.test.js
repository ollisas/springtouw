import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJumpDetector } from '../counter.js';
import { jumpSeries, makePose } from './synth.js';

function run(samples, detector = createJumpDetector()) {
  const times = [];
  const results = [];
  for (const s of samples) {
    const r = detector.push(s);
    results.push(r);
    if (r.jump) times.push(s.t);
  }
  return { times, results };
}

const inRange = (n, lo, hi) => assert.ok(n >= lo && n <= hi, `verwacht ${lo}–${hi}, kreeg ${n}`);

test('counts a calm series of 50 jumps', () => {
  const { times } = run(jumpSeries({ jumps: 50, periodMs: 500, heightFrac: 0.08 }));
  inRange(times.length, 48, 50);
});

test('counts a fast series', () => {
  const { times } = run(jumpSeries({ jumps: 60, periodMs: 330, heightFrac: 0.06 }));
  inRange(times.length, 58, 60);
});

test('does not count breathing', () => {
  const { times } = run(
    jumpSeries({ jumps: 3, periodMs: 3000, heightFrac: 0.01, standBeforeMs: 500, standAfterMs: 500 }),
  );
  assert.equal(times.length, 0);
});

test('does not count while out of view', () => {
  const { times, results } = run(jumpSeries({ jumps: 6, periodMs: 500, heightFrac: 0.08, visible: false }));
  assert.equal(times.length, 0);
  assert.ok(results.every((r) => r.inView === false));
});

test('does not finish a jump across leaving view', () => {
  const samples = [];
  let t = 0;
  const dt = 1000 / 30;
  for (let i = 0; i < 30; i++, t += dt) samples.push({ t, landmarks: makePose({ hipY: 0.55 }) });
  for (let i = 0; i < 5; i++, t += dt) samples.push({ t, landmarks: makePose({ hipY: 0.55 - 0.2 * 0.1 }) });
  for (let i = 0; i < 30; i++, t += dt) samples.push({ t, landmarks: makePose({ hipY: 0.55, visible: false }) });
  for (let i = 0; i < 30; i++, t += dt) samples.push({ t, landmarks: makePose({ hipY: 0.55 }) });
  assert.equal(run(samples).times.length, 0);
});

test('counts nothing when no person is found', () => {
  const r = createJumpDetector().push({ t: 0, landmarks: null });
  assert.deepEqual(r, { jump: false, inView: false });
});

test('ignores noise', () => {
  const { times } = run(jumpSeries({ jumps: 30, periodMs: 500, heightFrac: 0.08, noise: 0.01 }));
  inRange(times.length, 29, 30);
});

test('is distance independent', () => {
  const far = run(jumpSeries({ jumps: 30, scale: 0.5 })).times.length;
  const near = run(jumpSeries({ jumps: 30, scale: 1 })).times.length;
  assert.equal(far, near);
  inRange(near, 29, 30);
});

test('never counts faster than 200 ms', () => {
  const samples = jumpSeries({ jumps: 20, periodMs: 120, heightFrac: 0.08, fps: 60 });
  const { times } = run(samples);
  const duration = samples.at(-1).t - samples[0].t;
  assert.ok(times.length <= Math.ceil(duration / 200));
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 200);
});

test('reset forgets a half-finished jump', () => {
  const d = createJumpDetector();
  const dt = 1000 / 30;
  let t = 0;
  for (let i = 0; i < 30; i++, t += dt) d.push({ t, landmarks: makePose({ hipY: 0.55 }) });
  for (let i = 0; i < 5; i++, t += dt) d.push({ t, landmarks: makePose({ hipY: 0.55 - 0.02 }) });
  d.reset();
  let jumps = 0;
  for (let i = 0; i < 30; i++, t += dt) if (d.push({ t, landmarks: makePose({ hipY: 0.55 }) }).jump) jumps++;
  assert.equal(jumps, 0);
});
