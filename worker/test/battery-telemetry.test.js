import test from 'node:test';
import assert from 'node:assert/strict';
import { batteryPercentage, cameraBatteryLabel, nativeCameraLink } from '../../src/batteryTelemetry.js';

test('native and browser battery fractions report real percentages including an empty battery', () => {
  assert.equal(batteryPercentage(0.73), 73);
  assert.equal(batteryPercentage(0), 0);
  assert.equal(batteryPercentage(1), 100);
});
test('unknown iPhone battery values never become a fabricated 0%', () => {
  for (const value of [-1, undefined, null, NaN, Infinity, 101, '0.5']) assert.equal(batteryPercentage(value), null);
});
test('missing browser battery support points to the phone app without claiming a permission block', () => {
  assert.equal(cameraBatteryLabel({ battery:null,telemetryConsent:true,telemetrySupport:{battery:false} }), 'USE PHONE APP');
  assert.equal(cameraBatteryLabel({ battery:null,telemetryConsent:false }), 'NOT SHARED');
  assert.equal(cameraBatteryLabel({ battery:73, charging:true }), '73% ⚡');
});
test('phone app handoff preserves the exact room-scoped invite without unrelated parameters', () => {
  const link = new URL(nativeCameraLink('?network=production&room=room-1&join=invite&other=ignored'));
  assert.equal(link.protocol, 'urbandirectorstudio:');
  assert.equal(link.hostname, 'camera');
  assert.equal(link.searchParams.get('join'), 'invite');
  assert.equal(link.searchParams.get('network'), 'production');
  assert.equal(link.searchParams.get('room'), 'room-1');
  assert.equal(link.searchParams.has('other'), false);
  assert.equal(nativeCameraLink('?network=production&room=room-1'), '');
});
