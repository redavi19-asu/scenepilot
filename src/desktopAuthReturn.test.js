import test from 'node:test';
import assert from 'node:assert/strict';
import {desktopAuthReturn} from './desktopAuthReturn.js';
test('camera login preserves the invite without copying arbitrary query data',()=>{
  assert.equal(desktopAuthReturn({search:'?camera=1&network=crew&room=show&join=abc123&ticket=secret&other=value'}),'/app?camera=1&network=crew&room=show&join=abc123');
});
test('ordinary login and desktop browser callbacks keep their destinations',()=>{
  assert.equal(desktopAuthReturn({search:''}),'/app');
  assert.equal(desktopAuthReturn({search:'?return_to=https://evil.example'}),'/app');
  assert.equal(desktopAuthReturn({search:'?return_to=%2Fdesktop-auth%3Frequest%3D123'}),'/desktop-auth?request=123');
});
