import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseListingForUser } from '../release-listing.js';

const env = {
  DIRECTOR_WINDOWS_DOWNLOAD_URL: 'https://example.com/installer.exe',
  DIRECTOR_MAC_ARM_DOWNLOAD_URL: 'https://example.com/installer.dmg'
};
const active = {status:'active', role:'user', plan:'pro', accessStatus:'active', entitlementExpiresAt:Date.now()+60000};
test('release availability is visible but direct URLs remain hidden from guests and unpaid accounts', () => {
  for (const user of [null, {status:'active',role:'user',plan:'free',accessStatus:'pending'}, {...active,accessStatus:'suspended'}, {...active,entitlementExpiresAt:Date.now()-1000}]) {
    const listing=releaseListingForUser(env,user);
    assert.equal(listing.available.windows,true);
    assert.equal(listing.windows,'');
    assert.equal(listing.macArm,'');
  }
});
test('active subscribed accounts can request verified download URLs', () => {
  const listing=releaseListingForUser(env,active);
  assert.equal(listing.windows,env.DIRECTOR_WINDOWS_DOWNLOAD_URL);
  assert.equal(listing.macArm,env.DIRECTOR_MAC_ARM_DOWNLOAD_URL);
  assert.equal(listing.available.android,false);
});
