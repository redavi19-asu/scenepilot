import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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
console.log('Editable screenshot drafts identified; approved placements retained.');
await writeFile('apple-screenshot-inspection.json',JSON.stringify({libraryId:library.id,drafts,catalog},null,2));

if(process.argv.includes('--upload')) {
  const targets=[
    {platform:'MAC_OS',device:'Mac',group:'MAC_PROFILE',width:2880,height:1800},
    {platform:'IOS',device:'iPhone-6.3-inch',group:'IPHONE_DYNAMIC_ISLAND_MEDIUM_PROFILE',width:2622,height:1206},
    {platform:'IOS',device:'iPad-13-inch',group:'IPAD_13_PROFILE',width:2752,height:2064},
  ];
  const report={appId:APP,submittedForReview:false,groups:[]};
  const type=catalog.placementTypes.find(t=>t.placementTypeId==='APP_SCREENSHOT');
  const policy=catalog.features.find(f=>f.featureId==='APP_STORE_VERSIONS').placementPolicies.find(p=>p.placementType==='APP_SCREENSHOT');
  for(const target of targets) {
    const {platform,device,group,width,height}=target;
    const draft=drafts[platform];
    const original=draft.placements.filter(p=>p.attributes.placementGroup===group);
    const mapping=type.specMappings.find(m=>m.placementGroupId===group);
    const spec=catalog.imageSpecs.find(s=>mapping?.specs.includes(s.specId)&&s.dimensions.minWidth===width&&s.dimensions.minHeight===height);
    const limit=policy.groupLimits.find(l=>l.groupIds.includes(group))?.maxCount;
    if(!spec||!limit||!catalog.placementProfileGroups.some(g=>g.placementProfileGroupId===group)) throw Error('Apple catalog does not support the target.');
    const directory='docs/app-store-screenshots/2026-11-15/'+device;
    const files=(await readdir(directory)).filter(n=>n.endsWith('.jpg')).sort();
    if(files.length!==6) throw Error('Exactly six screenshot files are required per target.');
    const images=await list('/v1/appAssetLibraries/'+library.id+'/images?limit=200');
    const result={device,group,versionId:draft.version,localizationId:draft.localization,preservedPlacementIds:original.map(p=>p.id),screenshots:[]};
    const newPlacementIds=[];
    for(const name of files) {
      const bytes=await readFile(directory+'/'+name);
      const checksum=createHash('sha256').update(bytes).digest('hex');
      const referenceName='UDS 2026-11-15 '+device+' '+name+' '+checksum.slice(0,12);
      let image=images.find(i=>i.attributes.referenceName===referenceName);
      const already=!!image&&original.some(p=>p.relationships.image?.data?.id===image.id);
      const existingCount=original.length+newPlacementIds.filter(id=>!original.some(p=>p.id===id)).length;
      if(!already&&existingCount>=limit) throw Error('Preserving approved screenshots leaves insufficient gallery capacity.');
      if(!image) {
        image=(await api('/v1/appAssetLibraryImages','POST',{data:{type:'appAssetLibraryImages',attributes:{fileName:name,fileSize:bytes.length,category:'APP_SCREENSHOTS_AND_PREVIEWS',referenceName},relationships:{assetLibrary:{data:{type:'appAssetLibraries',id:library.id}}}}})).data;
        images.push(image);
      }
      if(image.attributes.fileSize!==bytes.length) throw Error('Existing asset size differs from intended source.');
      if(image.attributes.state==='AWAITING_UPLOAD') {
        for(const op of image.attributes.uploadOperations) {
          const url=new URL(op.url);
          if(url.protocol!=='https:'||!url.hostname.endsWith('.apple.com')) throw Error('Unexpected Apple upload host.');
          const part=bytes.subarray(op.offset,op.offset+op.length);
          if(part.length!==op.length) throw Error('Invalid upload byte range.');
          let success=false;
          for(let attempt=0;attempt<3;attempt++) {
            try {
              const r=await fetch(url,{method:op.method,headers:Object.fromEntries(op.requestHeaders.map(h=>[h.name,h.value])),body:part,signal:AbortSignal.timeout(60000)});
              if(r.ok){success=true;break;}
            } catch {}
          }
          if(!success) throw Error('Apple binary upload failed after three attempts.');
        }
        await api('/v1/appAssetLibraryImages/'+image.id,'PATCH',{data:{type:'appAssetLibraryImages',id:image.id,attributes:{uploaded:true}}});
      }
      for(let attempt=0;attempt<90;attempt++) {
        image=(await api('/v1/appAssetLibraryImages/'+image.id)).data;
        if(['PREPARE_FOR_SUBMISSION','APPROVED'].includes(image.attributes.state)) break;
        if(image.attributes.state==='FAILED') throw Error('Apple image processing failed: '+JSON.stringify(image.attributes.stateDetails));
        if(attempt===89) throw Error('Apple screenshot processing remains pending.');
        await new Promise(resolve=>setTimeout(resolve,2000));
      }
      const asset=image.attributes.imageAsset;
      if(image.attributes.specId!==spec.specId||asset.width!==width||asset.height!==height) throw Error('Apple processed the asset at an unexpected specification.');
      let placement=original.find(p=>p.relationships.image?.data?.id===image.id);
      if(!placement) placement=(await api('/v1/appAssetLibraryPlacements','POST',{data:{type:'appAssetLibraryPlacements',attributes:{placementType:'APP_SCREENSHOT',placementGroup:group},relationships:{image:{data:{type:'appAssetLibraryImages',id:image.id}},appStoreVersionLocalization:{data:{type:'appStoreVersionLocalizations',id:draft.localization}}}}})).data;
      newPlacementIds.push(placement.id);
      result.screenshots.push({file:name,sha256:checksum,imageId:image.id,placementId:placement.id,width,height,state:image.attributes.state,specId:image.attributes.specId});
      console.log(device+' / '+name+': Apple processed '+width+'x'+height+'; gallery placement saved.');
      await writeFile('apple-screenshot-verification.json',JSON.stringify(report,null,2));
    }
    const ordered=[...original.filter(p=>!newPlacementIds.includes(p.id)).map(p=>p.id),...newPlacementIds];
    await api('/v1/appAssetLibraryPlacementOrderingRequests','POST',{data:{type:'appAssetLibraryPlacementOrderingRequests',attributes:{placementGroup:group},relationships:{orderedPlacements:{data:ordered.map(id=>({type:'appAssetLibraryPlacements',id}))},appStoreVersionLocalization:{data:{type:'appStoreVersionLocalizations',id:draft.localization}}}}});
    const actual=(await list('/v1/appStoreVersionLocalizations/'+draft.localization+'/placements?include=image&sort=placementGroupPosition&limit=200')).filter(p=>p.attributes.placementGroup===group);
    if(JSON.stringify(actual.map(p=>p.id))!==JSON.stringify(ordered)) throw Error('Gallery order verification failed.');
    for(const old of original) if(!actual.some(p=>p.id===old.id&&p.relationships.image?.data?.id===old.relationships.image?.data?.id)) throw Error('An existing approved screenshot placement changed.');
    result.totalScreenshotCount=actual.length;
    result.preservedPlacementIds=original.filter(p=>!newPlacementIds.includes(p.id)).map(p=>p.id);
    result.verified=true;
    report.groups.push(result);
    await writeFile('apple-screenshot-verification.json',JSON.stringify(report,null,2));
  }
  for(const d of Object.values(drafts)) {
    const v=(await api('/v1/appStoreVersions/'+d.version)).data;
    if(v.attributes.appStoreState!=='PREPARE_FOR_SUBMISSION') throw Error('Draft unexpectedly left Prepare for Submission.');
  }
  console.log(JSON.stringify(report,null,2));
}

