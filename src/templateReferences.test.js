import test from 'node:test';
import assert from 'node:assert/strict';
import {TEMPLATE_REFERENCES,referenceThumbnail,referenceWatchUrl} from './templateReferences.js';
test('source previews identify the requested original performers and use official video IDs',()=>{
  assert.match(TEMPLATE_REFERENCES['lobby-music-video'].credit,/Quavo & Takeoff/);
  assert.match(TEMPLATE_REFERENCES['dead-fresh-lifestyle-video'].title,/Lil Baby.*Dead Fresh/);
  assert.match(TEMPLATE_REFERENCES['parents-store'].credit,/Progressive.*Dr. Rick/);
  for(const source of Object.values(TEMPLATE_REFERENCES)){
    assert.match(source.videoId,/^[A-Za-z0-9_-]{11}$/);
    assert.equal(new URL(referenceThumbnail(source)).hostname,'i.ytimg.com');
    const player=new URL(referenceWatchUrl(source));
    assert.equal(player.origin,'https://www.youtube.com');
    assert.equal(player.pathname,'/watch');
    assert.equal(player.searchParams.get('v'),source.videoId);
  }
  assert.equal(referenceWatchUrl({videoId:'unapproved'}),null);
});
