import test from 'node:test';
import assert from 'node:assert/strict';
import { screenCaptureError, validateScreenCapture } from './screenCapture.js';
test('Mac capture errors explain OS permissions and focused click requirement', () => {
  assert.match(screenCaptureError({name:'NotReadableError'}), /Screen & System Audio Recording/);
  assert.match(screenCaptureError({name:'NotAllowedError'}), /CANCELLED OR DENIED/);
  assert.match(screenCaptureError({name:'InvalidStateError'}), /FOCUSED/);
  assert.match(screenCaptureError({name:'NotFoundError'}), /open the window/);
});
test('reject ended or audio-only captures and stop all acquired tracks', () => {
  let stopped = 0;
  const ended = {readyState:'ended', stop(){stopped++;}};
  assert.throws(() => validateScreenCapture({getVideoTracks:()=>[ended],getTracks:()=>[ended]}), /No live/);
  assert.equal(stopped,1);
  assert.throws(() => validateScreenCapture({getVideoTracks:()=>[],getTracks:()=>[]}), /No live/);
});
test('accept live screen video without requiring shared audio', () => {
  const capture = {getVideoTracks:()=>[{readyState:'live'}]};
  assert.equal(validateScreenCapture(capture), capture);
});
