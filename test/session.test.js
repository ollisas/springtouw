import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../session.js';

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
  };
}

const throwingStorage = {
  getItem() {
    throw new Error('geen toegang');
  },
  setItem() {
    throw new Error('geen toegang');
  },
};

test('clock', () => {
  const s = createSession();
  [0, 500, 1000].forEach((t) => s.addJump(t));
  assert.equal(s.tick(1000).elapsedMs, 1000);
  assert.equal(s.tick(2000).elapsedMs, 2000);
  assert.equal(s.tick(10000).elapsedMs, 4000);
  s.addJump(10000);
  assert.equal(s.tick(10500).elapsedMs, 4500);
});

test('clock is zero before the first jump', () => {
  assert.equal(createSession().tick(5000).elapsedMs, 0);
});

test('tempo', () => {
  const s = createSession();
  for (let t = 0; t <= 4500; t += 500) s.addJump(t);
  assert.equal(s.tick(4500).perMinute, 120);
  assert.equal(s.tick(8000).perMinute, null);
  const one = createSession();
  one.addJump(0);
  assert.equal(one.tick(100).perMinute, null);
});

test('count', () => {
  const s = createSession();
  [0, 500, 1000].forEach((t) => s.addJump(t));
  assert.equal(s.tick(1000).count, 3);
});

test('best persists', () => {
  const storage = fakeStorage();
  const s = createSession({ storage });
  for (let i = 0; i < 5; i++) s.addJump(i * 500);
  s.reset();
  for (let i = 0; i < 3; i++) s.addJump(10000 + i * 500);
  const r = s.tick(11000);
  assert.equal(r.best, 5);
  assert.equal(r.count, 3);
  assert.equal(storage.data['springtouw.best'], '5');
  assert.equal(createSession({ storage }).tick(0).best, 5);
});

test('bad storage', () => {
  assert.equal(createSession({ storage: fakeStorage({ 'springtouw.best': 'abc' }) }).tick(0).best, 0);
  const s = createSession({ storage: throwingStorage });
  s.addJump(0);
  s.addJump(500);
  assert.equal(s.tick(500).best, 2);
});

test('reset', () => {
  const s = createSession();
  [0, 500, 1000].forEach((t) => s.addJump(t));
  s.reset();
  const r = s.tick(1200);
  assert.equal(r.count, 0);
  assert.equal(r.elapsedMs, 0);
  assert.equal(r.perMinute, null);
  assert.equal(r.best, 3);
});
