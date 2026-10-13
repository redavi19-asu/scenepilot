import { apiFetch } from "./runtimeApi";

// Reuse ephemeral TURN credentials for one production, never persist them to disk.
const cache = new Map();
const PADDING_MS = 5 * 60 * 1000;

export async function getDirectorIceServers({ network, room, join = "", force = false }) {
  if (!network || !room) throw new Error("A Director network and room are required for secure media.");
  const key = [network, room, join].join(":");
  const cached = cache.get(key);
  if (!force && cached && cached.expiresAt > Date.now() + PADDING_MS) {
    return cached.iceServers;
  }
  if (!force && cached?.pending) return cached.pending;

  const pending = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await apiFetch("/api/media/ice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ network, room, join }),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      const iceServers = data.iceServers;
      if (!response.ok || !Array.isArray(iceServers) ||
          !iceServers.some(server => server.username && server.credential)) {
        throw new Error(data.error || "Director TURN relay is unavailable.");
      }
      cache.set(key, { iceServers, expiresAt: Number(data.expiresAt) || Date.now() + 3600000 });
      return iceServers;
    } finally {
      clearTimeout(timer);
      if (cache.get(key)?.pending === pending) cache.delete(key);
    }
  })();
  cache.set(key, { pending });
  try {
    const servers = await pending;
    window.dispatchEvent(new CustomEvent("scenepilot:relay-health", { detail: { available: true } }));
    return servers;
  } catch (error) {
    // Keep existing same-network camera operation available while TURN provisioning
    // is incomplete. The UI must mark cross-network connectivity as degraded.
    console.warn("Director TURN unavailable; limited direct-only media mode.", error);
    window.dispatchEvent(new CustomEvent("scenepilot:relay-health", { detail: { available: false } }));
    return [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
  }
}

export function clearDirectorIceCache() {
  cache.clear();
}
