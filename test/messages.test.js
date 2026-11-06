import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cameraErrorMessage } from '../messages.js';

const err = (name) => Object.assign(new Error('x'), { name });

test('no permission explains the Android route too', () => {
  const m = cameraErrorMessage(err('NotAllowedError'));
  assert.match(m, /Geen toegang tot de camera/);
  assert.match(m, /Instellingen › Apps › Chrome › Rechten/);
});

test('camera in use by another app', () => {
  assert.match(cameraErrorMessage(err('NotReadableError')), /andere app/);
});

test('no camera found', () => {
  assert.match(cameraErrorMessage(err('NotFoundError')), /Geen camera gevonden/);
  assert.match(cameraErrorMessage(err('OverconstrainedError')), /Geen camera gevonden/);
});

test('unknown errors stay in Dutch without raw English names', () => {
  const m = cameraErrorMessage(err('WeirdError'));
  assert.doesNotMatch(m, /WeirdError/);
  assert.match(m, /opnieuw/);
});
