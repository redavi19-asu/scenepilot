import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import { AI_TEMPLATE_ARTWORK } from './aiTemplateArtwork.js';
test('featured templates and the freestyle template ship real local thumbnail pictures', async()=>{
  assert.deepEqual(Object.keys(AI_TEMPLATE_ARTWORK),['parents-store','parents-neighbor','lobby-music-video','dead-fresh-lifestyle-video','street-freestyle-video']);
  for(const artwork of Object.values(AI_TEMPLATE_ARTWORK)) {
    assert.match(artwork.src,/^ai-templates\/[a-z-]+\.jpg$/);
    assert.ok(artwork.alt.length>20);
    const image=await readFile(new URL(`../public/${artwork.src}`,import.meta.url));
    assert.equal(image.readUInt16BE(0),0xffd8);
    assert.ok(image.length>10000 && image.length<300000,'thumbnail should be a real, compressed image');
  }
});
