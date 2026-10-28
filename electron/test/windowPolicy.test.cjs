const test = require('node:test');
const assert = require('node:assert/strict');
const { isMonitorPopup } = require('../windowPolicy.cjs');
test('desktop wrapper permits inherited-origin monitor portals', () => {
  for (const view of ['program','preview','main','multiview','director','screen','camera-1','camera-9']) {
    assert.equal(isMonitorPopup('about:blank', `uds-popout-${view}`), true);
  }
});
test('desktop wrapper does not permit arbitrary blank or external popups', () => {
  for (const [url, name] of [['about:blank','_blank'],['https://example.com','uds-popout-program'],['about:blank','uds-popout-camera-10'],['about:blank','uds-popout-unknown']]) {
    assert.equal(isMonitorPopup(url,name),false);
  }
});
