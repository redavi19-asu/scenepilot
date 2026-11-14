import { refreshGoogleSubscriptions } from "./google-play-billing.js";
import { releaseListingForUser, releaseObjectForPlatform } from "./release-listing.js";
import baseWorker, { ScenePilotRoom } from "./index.js";
import { handleAiStudio } from "./ai-studio.js";
import { applyProfitSafeAiPricing } from "./ai-pricing.js";

export { ScenePilotRoom };

async function currentUserForAi(request, env, ctx) {
  const authUrl = new URL(request.url);
  authUrl.pathname = "/api/auth/me";
  authUrl.search = "";

  const authRequest = new Request(authUrl.toString(), {
    method: "GET",
    headers: request.headers
  });

  const response = await baseWorker.fetch(authRequest, env, ctx);
  if (!response.ok) return null;
  const data = await response.json().catch(() => ({}));
  return data?.user || null;
}

async function ensureAiTransactionBootstrap(env) {
  if (!env.DB) return;
  // Preserve the existing ledger schema. New reservations create the job and
  // debit atomically; historical job_id values remain audit references.
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS uds_ai_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      kind TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      job_id TEXT,
      created_at INTEGER NOT NULL
    )`
  ).run();
}

async function applyPricingToStudioResponse(response) {
  if (!response?.ok) return response;
  const contentType = String(response.headers.get("Content-Type") || "");
  if (!contentType.includes("application/json")) return response;

  const data = await response.json().catch(() => null);
  if (!data) return response;

  const headers = new Headers(response.headers);
  return new Response(JSON.stringify(applyProfitSafeAiPricing(data)), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  scheduled(_event, env, ctx) {
    ctx.waitUntil(refreshGoogleSubscriptions(env));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/releases" && request.method === "GET") {
      // Only authenticated customers with active Studio access receive download URLs.
      // Availability is public, but actual release links never appear in guest/pending JSON.
      const user = await currentUserForAi(request, env, ctx);
      return new Response(JSON.stringify(await releaseListingForUser(env, user)), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "private, no-store",
          "Vary": "Cookie, Authorization"
        }
      });
    }

    if (url.pathname.startsWith("/api/downloads/")) {
      if (request.method !== "GET") return new Response("Method not allowed", {status:405});
      const user=await currentUserForAi(request,env,ctx);
      const selected=releaseObjectForPlatform(user,url.pathname.slice("/api/downloads/".length));
      if(selected.status!==200)return new Response(
        selected.status===401?"Sign in to download.":selected.status===403?"Active Studio subscription required.":"Not found.",
        {status:selected.status,headers:{"Cache-Control":"private, no-store"}}
      );
      if(!env.DIRECTOR_INSTALLERS)return new Response("Private downloads unavailable.",{status:503});
      const binary=await env.DIRECTOR_INSTALLERS.get(selected.key);
      if(!binary)return new Response("Installer not available.",{status:404});
      return new Response(binary.body,{status:200,headers:{
        "Content-Type":"application/octet-stream",
        "Content-Length":String(binary.size),
        "Content-Disposition":`attachment; filename="${selected.filename}"`,
        "Cache-Control":"private, no-store",
        "X-Content-Type-Options":"nosniff"
      }});
    }

    if (url.pathname.startsWith("/api/ai/")) {
      if (request.method === "OPTIONS") {
        return handleAiStudio(request, env, null);
      }
      await ensureAiTransactionBootstrap(env);
      const user = await currentUserForAi(request, env, ctx);
      const response = await handleAiStudio(request, env, user);

      if (url.pathname === "/api/ai/studio" && request.method === "GET") {
        return applyPricingToStudioResponse(response);
      }

      return response;
    }

    const response = await baseWorker.fetch(request, env, ctx);
    if (response.headers.get("Content-Type")?.includes("text/html")) {
      const headers = new Headers(response.headers);
      headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self' https://challenges.cloudflare.com https://*.stripe.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https: wss:; frame-src https://challenges.cloudflare.com https://*.stripe.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self' https://*.stripe.com");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
      return new Response(response.body, { status: response.status, headers });
    }
    return response;
  }
};
