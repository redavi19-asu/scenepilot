import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import {appleToken,verifyTestflight} from './verify-testflight-build.mjs';
test('Apple JWT is a valid ES256 signature with short expiry',()=>{
  const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});
  const token=appleToken(privateKey,'key','issuer',1000);const [head,body,sig]=token.split('.');
  assert.equal(JSON.parse(Buffer.from(head,'base64url')).alg,'ES256');
  assert.equal(JSON.parse(Buffer.from(body,'base64url')).exp,1600);
  assert.equal(verify('sha256',Buffer.from(`${head}.${body}`),{key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(sig,'base64url')),true);
});
function fake({processing='VALID',groups=[{id:'internal',attributes:{isInternalGroup:true,iosBuildsAvailableForAppleSiliconMac:true}},{id:'external',attributes:{isInternalGroup:false}}],assigned=true}={}){
  const mutations=[];
  return {mutations,api:async(path,method='GET',body)=>{
    if(method==='POST'){mutations.push({path,body});return {};}
    if(path.startsWith('/v1/apps?'))return {data:[{id:'app'}]};
    if(path.startsWith('/v1/builds?'))return {data:[{id:'build',attributes:{version:'22',processingState:processing}}]};
    if(path.includes('/betaGroups?'))return {data:groups};
    if(path.includes('/relationships/builds'))return {data:assigned?[{id:'build'}]:[]};
    if(path.endsWith('/buildBetaDetail'))return {data:{attributes:{internalBuildState:'IN_BETA_TESTING',externalBuildState:'READY_FOR_BETA_TESTING'}}};
    throw new Error(path);
  }};
}
test('processed build already available to an internal group needs no assignment mutation',async()=>{
  const f=fake();const result=await verifyTestflight({...f,buildNumber:'22',log(){}});
  assert.equal(result.internalMacEnabledGroups,1);assert.equal(result.assignedInternalGroups,1);assert.equal(f.mutations.length,0);
});
test('already-assigned build requires no mutation',async()=>{
  const f=fake({assigned:true});await verifyTestflight({...f,buildNumber:'22',log(){}});assert.equal(f.mutations.length,0);
});
test('invalid and pending Apple processing never claim tester availability',async()=>{
  for(const processing of ['INVALID','PROCESSING']){
    const f=fake({processing});await assert.rejects(verifyTestflight({...f,buildNumber:'22',attempts:1,log(){}}),/Apple|processing/);assert.equal(f.mutations.length,0);
  }
});
test('absence of existing internal groups reports distribution needs attention',async()=>{
  const f=fake({groups:[]});await assert.rejects(verifyTestflight({...f,buildNumber:'22',log(){}}),/no existing internal tester/);
});

test('processed but unassigned builds do not claim TestFlight availability',async()=>{
  const f=fake({assigned:false});await assert.rejects(verifyTestflight({...f,buildNumber:'22',log(){}}),/not assigned/);assert.equal(f.mutations.length,0);
});
