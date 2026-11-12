import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeBackendOrigin, PRODUCTION_NATIVE_ORIGIN, BILLING_QC_ORIGIN} from './nativeBackend.js';
test('normal app keeps production routing; explicit QC build targets the isolated backend',()=>{
 assert.equal(nativeBackendOrigin(),PRODUCTION_NATIVE_ORIGIN);
 assert.equal(nativeBackendOrigin(BILLING_QC_ORIGIN),BILLING_QC_ORIGIN);
});
test('build cannot send native account credentials to an arbitrary origin',()=>{
 for(const value of ['http://localhost','https://evil.example',BILLING_QC_ORIGIN+'/','https://scenepilot.ryanedavis.workers.dev.evil.example']) assert.throws(()=>nativeBackendOrigin(value),/Unsupported/);
});
