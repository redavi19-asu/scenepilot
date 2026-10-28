import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForIngestSocket, releaseIngestConnection } from './ingestConnection.js';

function socket() { return { closed: false, close() { this.closed = true; this.onclose?.(); } }; }
test('successful ingest handshake removes temporary handlers', async () => {
  const ws = socket(); const pending = waitForIngestSocket(ws);
  ws.onopen(); await pending;
  assert.equal(ws.closed, false); assert.equal(ws.onerror, null); assert.equal(ws.onclose, null);
});
for (const event of ['onerror', 'onclose']) test(`${event} rejects ingest promptly and closes socket`, async () => {
  const ws = socket(); const pending = waitForIngestSocket(ws);
  ws[event](); await assert.rejects(pending, /ingest/); assert.equal(ws.closed, true);
});
test('timeout closes connecting socket and removes late open callback', async () => {
  const ws = socket(); await assert.rejects(waitForIngestSocket(ws, 5), /timed out/);
  assert.equal(ws.closed, true); assert.equal(ws.onopen, null);
});
test('disconnect releases active ingest so Resume Live is allowed; old socket cannot clear replacement', () => {
  const old = socket(), current = socket();
  const ref = { current: { socket: old, recorder: {} } };
  assert.equal(releaseIngestConnection(ref, old), true); assert.equal(ref.current.socket, null);
  ref.current = { socket: current, recorder: {} };
  assert.equal(releaseIngestConnection(ref, old), false); assert.equal(ref.current.socket, current);
});
