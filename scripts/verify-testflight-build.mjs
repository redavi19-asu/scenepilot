import { readFile, appendFile } from 'node:fs/promises';
import { sign } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function appleToken(key, keyId, issuer, now = Math.floor(Date.now() / 1000)) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const data = `${encode({alg:'ES256',kid:keyId,typ:'JWT'})}.${encode({iss:issuer,iat:now,exp:now+600,aud:'appstoreconnect-v1'})}`;
  return `${data}.${sign('sha256',Buffer.from(data),{key,dsaEncoding:'ieee-p1363'}).toString('base64url')}`;
}

export async function verifyTestflight({api, buildNumber, wait = ms => new Promise(resolve=>setTimeout(resolve,ms)), log = console.log, attempts = 30}) {
  const apps = await api('/v1/apps?filter[bundleId]=com.icomputeranything.scenepilot&limit=2');
  if (apps.data?.length !== 1) throw new Error('Could not identify the Urban Director Studio Apple app.');
  const app = apps.data[0];
  let build;
  for(let i=0;i<attempts;i++) {
    const builds = await api(`/v1/builds?filter[app]=${encodeURIComponent(app.id)}&filter[version]=${encodeURIComponent(buildNumber)}&limit=5`);
    build = builds.data?.find(item=>item.attributes.version===String(buildNumber));
    const state = build?.attributes.processingState || 'WAITING_FOR_APPLE';
    log(`TestFlight build ${buildNumber}: ${state}`);
    if (['FAILED','INVALID'].includes(state)) throw new Error(`Apple rejected build processing: ${state}`);
    if (state==='VALID') break;
    if(i===attempts-1) throw new Error('Upload finished, but Apple processing is still pending. Check TestFlight before claiming availability.');
    await wait(20000);
  }
  const groups = [];
  let next = `/v1/apps/${encodeURIComponent(app.id)}/betaGroups?limit=200`;
  while(next) {
    const page=await api(next); groups.push(...(page.data||[])); next=page.links?.next || null;
  }
  const internal = groups.filter(group=>group.attributes.isInternalGroup);
  let detail;
  for(let i=0;i<10;i++) {
    detail = await api(`/v1/builds/${encodeURIComponent(build.id)}/buildBetaDetail`);
    if(detail.data?.attributes.internalBuildState==='IN_BETA_TESTING' || !internal.length) break;
    if(i===9) throw new Error(`Apple processed the build, but internal TestFlight availability is ${detail.data?.attributes.internalBuildState || 'unknown'}. Check App Store Connect.`);
    await wait(20000);
  }
  const assigned = [];
  for(const group of internal) {
    let next = `/v1/betaGroups/${encodeURIComponent(group.id)}/relationships/builds?limit=200`;
    while(next) {
      const relation = await api(next);
      if(relation.data?.some(item=>item.id===build.id)) { assigned.push(group); break; }
      next=relation.links?.next || null;
    }
  }
  const report = {
    buildNumber:String(buildNumber), processingState:build.attributes.processingState,
    internalBuildState:detail.data?.attributes.internalBuildState,
    externalBuildState:detail.data?.attributes.externalBuildState,
    existingInternalGroups:internal.length, assignedInternalGroups:assigned.length,
    internalMacEnabledGroups:assigned.filter(group=>group.attributes.iosBuildsAvailableForAppleSiliconMac).length
  };
  log(JSON.stringify(report));
  if (!internal.length) throw new Error('Apple processed the upload, but no existing internal tester group was found. Tester distribution needs attention in App Store Connect.');
  if (!assigned.length) throw new Error('Build is processed but not assigned to an existing internal tester group. Assign it in App Store Connect before claiming availability.');
  return report;
}

async function main() {
  const {APP_STORE_KEY_ID:keyId,APP_STORE_ISSUER_ID:issuer,BUILD_NUMBER:buildNumber,HOME:home,GITHUB_STEP_SUMMARY:summary}=process.env;
  if(!keyId||!issuer||!buildNumber) throw new Error('Apple key identifiers and build number are required.');
  const key=await readFile(`${home}/private_keys/AuthKey_${keyId}.p8`,'utf8');
  const api=async(path,method='GET',body)=>{
    const url=new URL(path,'https://api.appstoreconnect.apple.com');
    if(url.origin!=='https://api.appstoreconnect.apple.com') throw new Error('Unexpected Apple API pagination origin.');
    const response=await fetch(url,{method,headers:{Authorization:`Bearer ${appleToken(key,keyId,issuer)}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
    if(!response.ok) {
      const data=await response.json().catch(()=>({}));
      throw new Error(`Apple API ${response.status}: ${data.errors?.map(error=>error.code).join(', ')||'request failed'}`);
    }
    return response.status===204?{}:response.json();
  };
  const report=await verifyTestflight({api,buildNumber});
  if(summary) await appendFile(summary,`\n## TestFlight upload verification\n\nBuild **${buildNumber}** processed by Apple: **${report.processingState}**. Internal state: **${report.internalBuildState}**. Assigned to ${report.assignedInternalGroups} existing internal groups; ${report.internalMacEnabledGroups} permit Apple Silicon Mac testing. External state: **${report.externalBuildState}**. Public App Store review was not submitted.\n`);
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(error=>{console.error(error.message);process.exitCode=1;});
