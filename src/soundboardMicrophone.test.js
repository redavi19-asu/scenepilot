import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseAudioMime, microphoneConstraints, microphoneError, startMicrophoneCapture } from './soundboardMicrophone.js';

test('Apple native capture works when the web view has neither getUserMedia nor MediaRecorder', async () => {
  const wav = Buffer.alloc(88); wav.write('RIFF');
  const calls = [];
  const native = {
    async start(args) { calls.push(args); return { inputLabel: 'USB microphone', devices: [{deviceId:'usb',label:'USB microphone'}] }; },
    async meter() { return { level: .2, elapsed: 1 }; },
    async stop() { return { audioBase64: wav.toString('base64'), mimeType: 'audio/wav' }; },
    async cancel() { calls.push('cancel'); }
  };
  const capture = await startMicrophoneCapture({ native, deviceId:'usb' });
  assert.deepEqual(calls[0], {inputId:'usb'});
  assert.equal(capture.inputLabel,'USB microphone');
  assert.deepEqual(await capture.level(),{level:.2,elapsed:1});
  const audio = await capture.stop();
  assert.equal(audio.type,'audio/wav');
  assert.deepEqual(Buffer.from(await audio.arrayBuffer()),wav);
  await capture.cancel(); assert.equal(calls[1],'cancel');
});

test('empty native result and denied permission are not reported as saved samples', async () => {
  const capture = await startMicrophoneCapture({ native: { async start(){return {};}, async stop(){return {audioBase64:''};} } });
  await assert.rejects(capture.stop(),/No microphone audio/);
  await assert.rejects(startMicrophoneCapture({native:{async start(){throw new Error('Allow microphone access');}}}),/Allow microphone access/);
});

test('external microphones use exact selection and errors distinguish permissions from missing devices', () => {
  assert.deepEqual(microphoneConstraints('usb'),{audio:{deviceId:{exact:'usb'}},video:false});
  assert.match(microphoneError({name:'NotAllowedError'}),/permission was denied/);
  assert.match(microphoneError({name:'OverconstrainedError'}),/Reconnect/);
  assert.match(microphoneError({name:'NotReadableError'}),/could not open/);
  assert.equal(chooseAudioMime({isTypeSupported:type=>type==='audio/mp4'}),'audio/mp4');
});

class FakeRecorder {
  static instance;
  static isTypeSupported(type) { return type==='audio/mp4'; }
  constructor(stream, options) { this.stream=stream; this.options=options; this.mimeType=options.mimeType; this.state='inactive'; FakeRecorder.instance=this; }
  start(slice) { this.state='recording'; this.slice=slice; }
  stop() {
    this.state='inactive';
    queueMicrotask(()=>{this.ondataavailable({data:new Blob(['recorded-audio'])});this.onstop();});
  }
}

test('browser recording uses the selected USB mic, waits for final bytes and releases the input', async () => {
  const track={label:'USB mic',readyState:'live',stop(){this.stopped=true;}};
  let requested;
  const capture=await startMicrophoneCapture({mediaDevices:{async getUserMedia(args){requested=args;return {getAudioTracks:()=>[track],getTracks:()=>[track]};}},Recorder:FakeRecorder,deviceId:'usb'});
  assert.deepEqual(requested,microphoneConstraints('usb'));
  assert.equal(FakeRecorder.instance.options.mimeType,'audio/mp4');
  assert.equal(FakeRecorder.instance.slice,250);
  assert.equal(capture.inputLabel,'USB mic');
  assert.equal(await (await capture.stop()).text(),'recorded-audio');
  assert.equal(track.stopped,true);
});

test('the shared Director microphone is cloned so ending a sample does not stop live production', async () => {
  const originalMediaStream=globalThis.MediaStream;
  const clone={label:'Director mic',readyState:'live',stop(){this.stopped=true;}};
  const original={readyState:'live',enabled:true,getSettings:()=>({deviceId:'usb'}),clone:()=>clone};
  globalThis.MediaStream=class {constructor(tracks){this.tracks=tracks;}getAudioTracks(){return this.tracks;}getTracks(){return this.tracks;}};
  try {
    const capture=await startMicrophoneCapture({existingStream:{getAudioTracks:()=>[original]},mediaDevices:{getUserMedia(){throw new Error('must reuse');}},Recorder:FakeRecorder,deviceId:'usb'});
    await capture.stop();
    assert.equal(clone.stopped,true);
    assert.equal(original.readyState,'live');
  } finally { globalThis.MediaStream=originalMediaStream; }
});

test('capture setup failure releases the microphone and missing APIs get separate errors', async () => {
  const track={readyState:'live',stop(){this.stopped=true;}};
  class BrokenRecorder extends FakeRecorder { constructor(){throw new Error('unsupported codec');} }
  await assert.rejects(startMicrophoneCapture({mediaDevices:{async getUserMedia(){return {getTracks:()=>[track],getAudioTracks:()=>[track]};}},Recorder:BrokenRecorder}),/codec/);
  assert.equal(track.stopped,true);
  await assert.rejects(startMicrophoneCapture({}),/Microphone capture is unavailable/);
  await assert.rejects(startMicrophoneCapture({mediaDevices:{getUserMedia(){}}}),/Audio recording is unavailable/);
});
