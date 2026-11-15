import {readFile,writeFile,appendFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {appleToken} from './verify-testflight-build.mjs';
const e=process.env, root=e.RUNNER_TEMP;
const key=e.APP_STORE_PRIVATE_KEY, keyId=e.APP_STORE_KEY_ID, issuer=e.APP_STORE_ISSUER_ID;
async function api(path,method='GET',body){
 if(method!=='GET'&&path!=='/v1/certificates')throw Error('Only installer certificate creation is permitted.');
 const r=await fetch('https://api.appstoreconnect.apple.com'+path,{method,headers:{Authorization:'Bearer '+appleToken(key,keyId,issuer),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
 const d=await r.json();if(!r.ok)throw Error(JSON.stringify(d.errors?.map(x=>({code:x.code,detail:x.detail}))));
 return d;
}
await writeFile(root+'/distribution.p12',Buffer.from(e.IOS_CERT,'base64'),{mode:0o600});
execFileSync('openssl',['pkcs12','-legacy','-in',root+'/distribution.p12','-nocerts','-nodes','-out',root+'/signing-key.pem','-passin','env:IOS_CERT_PASSWORD'],{stdio:'pipe'});
const publicKey=execFileSync('openssl',['pkey','-in',root+'/signing-key.pem','-pubout'],{encoding:'utf8'}).trim();
const profile=(await api('/v1/profiles/7N6N36JFW5')).data;
if(profile.attributes.profileType!=='MAC_APP_STORE'||profile.attributes.profileState!=='ACTIVE')throw Error('The existing Mac distribution profile is not active.');
await writeFile(root+'/director-mac.provisionprofile',Buffer.from(profile.attributes.profileContent,'base64'),{mode:0o600});
const certs=(await api('/v1/certificates?filter[certificateType]=MAC_INSTALLER_DISTRIBUTION&limit=200')).data;
let installer;
for(const cert of certs){
 if(Date.parse(cert.attributes.expirationDate)<Date.now())continue;
 await writeFile(root+'/installer.cer',Buffer.from(cert.attributes.certificateContent,'base64'));
 const pub=execFileSync('openssl',['x509','-inform','DER','-in',root+'/installer.cer','-pubkey','-noout'],{encoding:'utf8'}).trim();
 if(pub===publicKey){installer=cert;break;}
}
if(!installer){
 if(certs.filter(c=>Date.parse(c.attributes.expirationDate)>Date.now()).length>=2)throw Error('Installer certificate capacity reached; existing installer private key is required.');
 execFileSync('openssl',['req','-new','-key',root+'/signing-key.pem','-out',root+'/installer.csr','-subj','/CN=Urban Director Studio CI Installer'],{stdio:'pipe'});
 installer=(await api('/v1/certificates','POST',{data:{type:'certificates',attributes:{certificateType:'MAC_INSTALLER_DISTRIBUTION',csrContent:await readFile(root+'/installer.csr','utf8')}}})).data;
 console.log('Created installer certificate using the existing backed-up distribution signing key; no certificate was revoked.');
}
await writeFile(root+'/installer.cer',Buffer.from(installer.attributes.certificateContent,'base64'));
execFileSync('openssl',['x509','-inform','DER','-in',root+'/installer.cer','-out',root+'/installer.pem']);
execFileSync('openssl',['pkcs12','-legacy','-export','-inkey',root+'/signing-key.pem','-in',root+'/installer.pem','-out',root+'/installer.p12','-passout','env:IOS_CERT_PASSWORD'],{stdio:'pipe'});
await appendFile(e.GITHUB_ENV,'UDS_MAS_PROFILE='+root+'/director-mac.provisionprofile\nCSC_INSTALLER_LINK='+root+'/installer.p12\n');
await writeFile(e.HOME+'/private_keys/AuthKey_'+keyId+'.p8',key,{mode:0o600});
console.log('Mac App Store profile and signing materials ready; no app was submitted.');
