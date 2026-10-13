// TURN keys stay in Cloudflare Worker secrets; browsers receive only expiring ICE credentials.
export const DIRECTOR_TURN_TTL_SECONDS = 6 * 60 * 60;

export async function issueDirectorIceServers(env, fetchTurn = fetch) {
  const id = String(env.DIRECTOR_TURN_KEY_ID || "").trim();
  const secret = String(env.DIRECTOR_TURN_KEY_SECRET || "").trim();
  if (!/^[a-f0-9]{32}$/i.test(id) || !secret) {
    throw new Error("TURN relay credentials are not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let response;
  try {
    response = await fetchTurn(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ ttl: DIRECTOR_TURN_TTL_SECONDS }),
        signal: controller.signal
      }
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`TURN credential provider returned HTTP ${response.status}.`);
  }

  const payload = await response.json();
  const servers = Array.isArray(payload?.iceServers)
    ? payload.iceServers
    : (payload?.iceServers ? [payload.iceServers] : []);

  const sanitized = servers.map(server => {
    const urls = (Array.isArray(server.urls) ? server.urls : [server.urls])
      .filter(url => typeof url === "string" && (
        /^stun:stun\.cloudflare\.com:3478$/i.test(url) ||
        /^turns?:turn\.cloudflare\.com:(?:3478|443|5349|80)\?transport=(?:udp|tcp)$/i.test(url)
      ));
    if (!urls.length) return null;
    if (urls.some(url => url.startsWith("turn:") || url.startsWith("turns:"))) {
      if (!server.username || !server.credential) return null;
      return { urls, username: server.username, credential: server.credential };
    }
    return { urls };
  }).filter(Boolean);

  if (!sanitized.some(server => server.username && server.credential)) {
    throw new Error("TURN provider returned no usable relay credentials.");
  }

  return { iceServers: sanitized, expiresAt: Date.now() + DIRECTOR_TURN_TTL_SECONDS * 1000 };
}
