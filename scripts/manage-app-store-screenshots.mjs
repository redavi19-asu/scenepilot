import { readFile, writeFile } from 'node:fs/promises';
import { appleToken } from './verify-testflight-build.mjs';
const APP='6811694662';
const {APP_STORE_PRIVATE_KEY:key,APP_STORE_KEY_ID:keyId,APP_STORE_ISSUER_ID:issuer}=process.env;
if(!key||!keyId||!issuer) throw Error('Configured Apple API credentials are required.');
async function api(path,method='GET',body) {
  const url=new URL(path,'https://api.appstoreconnect.apple.com');
  if(url.origin!=='https://api.appstoreconnect.apple.com') throw Error('Unexpected API origin.');
  if(method!=='GET' && !/^\/v1\/(appAssetLibraryImages|appAssetLibraryPlacements|appAssetLibraryPlacementOrderingRequests)(\/[^/?]+)?$/.test(url.pathname)) throw Error('Only screenshot asset and placement mutations are permitted.');
  const r=await fetch(url,{method,headers:{Authorization:'Bearer '+appleToken(key,keyId,issuer),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
  if(!r.ok){const d=await r.json().catch(()=>({}));throw Error('Apple API '+r.status+': '+JSON.stringify(d.errors?.map(e=>({code:e.code,detail:e.detail}))||[]));}
  return r.status===204?{}:r.json();
}
async function list(path) {
  const result=[];let next=path;
  while(next){const d=await api(next);result.push(...d.data);next=d.links?.next;}
  return result;
}
const library=(await api('/v1/apps/'+APP+'/assetLibrary')).data;
const catalog=(await api('/v1/appAssetLibraryRefData')).data[0].attributes;
const versions=await list('/v1/apps/'+APP+'/appStoreVersions?limit=50');
const drafts={};
for(const [platform,version] of [['IOS','1.0.2'],['MAC_OS','1.0.1']]){
  const v=versions.find(v=>v.attributes.platform===platform&&v.attributes.versionString===version&&v.attributes.appStoreState==='PREPARE_FOR_SUBMISSION');
  if(!v) throw Error('Required editable '+platform+' '+version+' draft is absent.');
  const locales=await list('/v1/appStoreVersions/'+v.id+'/appStoreVersionLocalizations?limit=50');
  const locale=locales.find(l=>l.attributes.locale==='en-US');
  if(!locale) throw Error('English U.S. localization missing.');
  const placements=await list('/v1/appStoreVersionLocalizations/'+locale.id+'/placements?include=image&sort=placementGroupPosition&limit=200');
  drafts[platform]={version:v.id,localization:locale.id,placements};
}
console.log(JSON.stringify({libraryId:library.id,versions:Object.fromEntries(Object.entries(drafts).map(([p,d])=>[p,{id:d.version,localization:d.localization,placements:d.placements}])),catalog},null,2));
await writeFile('apple-screenshot-inspection.json',JSON.stringify({libraryId:library.id,drafts,catalog},null,2));
