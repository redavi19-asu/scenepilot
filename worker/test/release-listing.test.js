import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseListingForUser,releaseObjectForPlatform,RELEASE_FILES} from '../release-listing.js';
const active={status:'active',role:'user',plan:'pro',accessStatus:'active',entitlementExpiresAt:Date.now()+60000};
const r2={head:async key=>key===RELEASE_FILES.windows.key?{size:119761840}:null};
test('anonymous, unpaid, suspended and expired users cannot obtain installer URLs',async()=>{
 for(const user of [null,{status:'active',role:'user',plan:'free',accessStatus:'pending'},{...active,accessStatus:'suspended'},{...active,entitlementExpiresAt:Date.now()-1000}]){
 const result=await releaseListingForUser({DIRECTOR_INSTALLERS:r2},user);
 assert.equal(result.available.windows,true);
 assert.equal(result.windows,'');
 assert.equal(releaseObjectForPlatform(user,'windows').status,user===null?401:403);
 }
});
test('subscribers get same-origin endpoints, never public GitHub URLs',async()=>{
 const result=await releaseListingForUser({DIRECTOR_INSTALLERS:r2},active);
 assert.equal(result.windows,'/api/downloads/windows');
 assert.equal(result.macArm,'');
 assert.equal(JSON.stringify(result).includes('github'),false);
 assert.deepEqual(releaseObjectForPlatform(active,'windows'),{status:200,...RELEASE_FILES.windows});
});
test('unknown platforms and unbound storage fail closed',async()=>{
 assert.equal(releaseObjectForPlatform(active,'../bad').status,404);
 const result=await releaseListingForUser({},active);
 assert.equal(result.windows,'');
 assert.equal(result.available.windows,false);
});
