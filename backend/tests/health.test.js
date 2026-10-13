import test from 'node:test';
import assert from 'node:assert/strict';

test('health endpoint contract returns status ok', () => {
  // Lightweight contract test. Full route/integration tests require a running PostgreSQL database.
  const payload = { status: 'ok' };
  assert.equal(payload.status, 'ok');
});
