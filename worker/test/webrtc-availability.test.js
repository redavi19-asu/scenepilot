import test from 'node:test';
import assert from 'node:assert/strict';
import { supportsWebRTC, createPeerConnection } from '../../src/webrtc.js';

test('camera video support requires both peer connections and media streams', () => {
  assert.equal(supportsWebRTC({}), false);
  assert.equal(supportsWebRTC({ MediaStream: class {} }), false);
  assert.equal(supportsWebRTC({ RTCPeerConnection: class {} }), false);
  assert.equal(supportsWebRTC({ RTCPeerConnection: class {}, MediaStream: class {} }), true);
});

test('unsupported native environment gives an actionable error before attempting negotiation', () => {
  const previous = globalThis.RTCPeerConnection;
  globalThis.RTCPeerConnection = undefined;
  try {
    assert.throws(() => createPeerConnection({ iceServers: [{ urls: 'stun:example.test' }] }), /Open Director in Safari or Chrome/);
  } finally {
    if (previous === undefined) delete globalThis.RTCPeerConnection;
    else globalThis.RTCPeerConnection = previous;
  }
});
