import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * Pure replica of the #2509 reconnect predicate.
 * 401 loggedOut within 30s of a stream:error 515 must reconnect;
 * a cold 401 must not.
 */
const STREAM_515_RECONNECT_GRACE_MS = 30_000;
const loggedOut = 401;
const forbidden = 403;
const codesToNotReconnect = [loggedOut, forbidden, 402, 406, 408];

function shouldReconnect(statusCode: number, lastStream515At: number, now: number): boolean {
  const recentStream515 = now - lastStream515At < STREAM_515_RECONNECT_GRACE_MS;
  return !codesToNotReconnect.includes(statusCode) || (statusCode === loggedOut && recentStream515);
}

test('515: loggedOut within grace window reconnects', () => {
  const now = 1_000_000;
  assert.equal(shouldReconnect(loggedOut, now - 1_000, now), true);
});

test('515: loggedOut after grace window is a real logout', () => {
  const now = 1_000_000;
  assert.equal(shouldReconnect(loggedOut, now - 31_000, now), false);
});

test('515: forbidden never reconnects even right after 515', () => {
  const now = 1_000_000;
  assert.equal(shouldReconnect(forbidden, now - 1_000, now), false);
});

test('515: other close codes still reconnect', () => {
  const now = 1_000_000;
  assert.equal(shouldReconnect(503, 0, now), true);
});
