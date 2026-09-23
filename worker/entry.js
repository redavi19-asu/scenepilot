import baseWorker, { ScenePilotRoom } from "./index.js";
import { handleAiStudio } from "./ai-studio.js";

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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/ai/")) {
      if (request.method === "OPTIONS") {
        return handleAiStudio(request, env, null);
      }
      const user = await currentUserForAi(request, env, ctx);
      return handleAiStudio(request, env, user);
    }

    return baseWorker.fetch(request, env, ctx);
  }
};
