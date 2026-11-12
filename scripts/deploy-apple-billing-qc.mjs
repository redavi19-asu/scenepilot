import { readFile, writeFile, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const configPath = 'wrangler.billing-sandbox.jsonc';
const config = JSON.parse(await readFile(configPath,'utf8'));
if (config.name !== 'director-billing-sandbox' ||
    config.d1_databases?.length !== 1 ||
    config.d1_databases[0].database_id !== 'ea8a6e9a-bb4e-4963-b393-a0b68d618be0' ||
    config.vars?.APP_STORE_TRANSACTION_ENVIRONMENT !== 'Sandbox') {
  throw new Error('Refusing to deploy outside the isolated billing sandbox.');
}
const secrets = {};
for (const name of ['APP_STORE_ISSUER_ID','APP_STORE_KEY_ID','APP_STORE_PRIVATE_KEY']) {
  if (!process.env[name]?.trim()) throw new Error(`Missing ${name}`);
  secrets[name] = process.env[name];
}
if (!process.env.RUNNER_TEMP || !process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
  throw new Error('Run this through the authorized GitHub billing QC job.');
}
const cli = join('node_modules','.bin','wrangler');
execFileSync(cli,['whoami'],{stdio:'inherit'});
const secretFile = join(process.env.RUNNER_TEMP,'apple-billing-qc-secrets.json');
try {
  await writeFile(secretFile,JSON.stringify(secrets),{mode:0o600});
  execFileSync(cli,['deploy','--config',configPath,'--secrets-file',secretFile],{stdio:'inherit'});
} finally {
  await unlink(secretFile).catch(()=>{});
}
const response=await fetch('https://director-billing-sandbox.ryanedavis.workers.dev/health');
const health=await response.json();
if (!response.ok || !health.ok || !health.appleBillingConfigured) throw new Error('Isolated Apple billing backend did not pass readiness checks.');
console.log(JSON.stringify({isolatedBillingBackendReady:true,migrationCount:health.migrationCount}));
