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
  // Token reservations are written immediately before the provider job row is
  // finalized, so job_id is intentionally an audit field instead of a FK.
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
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

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

    return baseWorker.fetch(request, env, ctx);
  }
};
