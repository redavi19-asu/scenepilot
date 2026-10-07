const hostname = "urbandirectorstudio.com";
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!account || !token) throw new Error("Cloudflare account/token secrets are required.");
async function cf(path, options = {}) {
  const result = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...options, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  });
  const body = await result.json();
  if (!result.ok || !body.success) throw new Error(body.errors?.map(error => error.message).join("; ") || `Cloudflare HTTP ${result.status}`);
  return body.result;
}
const zones = await cf(`/zones?name=${hostname}&status=active`);
const zone = zones.find(value => value.name === hostname && value.account?.id === account);
if (!zone) throw new Error("urbandirectorstudio.com must be owned, active in this Cloudflare account, and readable by the deployment token. No domain purchase was attempted.");
const domains = await cf(`/accounts/${account}/workers/domains`);
const existing = domains.find(value => value.hostname === hostname);
if (existing && existing.service !== "scenepilot") throw new Error("This domain is already assigned to another Worker; review that assignment before changing it.");
if (!existing) {
  await cf(`/accounts/${account}/workers/domains`, { method: "PUT", body: JSON.stringify({ hostname, service: "scenepilot", environment: "production", zone_id: zone.id }) });
}
console.log("Urban Director Studio production domain is attached. Verify Google/Apple authorized callbacks before switching the canonical login origin.");
