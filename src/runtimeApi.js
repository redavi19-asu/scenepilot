import { Capacitor } from "@capacitor/core";

const REMOTE_ORIGIN = "https://scenepilot.ryanedavis.workers.dev";
const SESSION_KEY = "urban-director:native-session";

export const isNativeApp = () => Capacitor.isNativePlatform();

export function publicOrigin() {
  return isNativeApp() ? REMOTE_ORIGIN : window.location.origin;
}

export function apiUrl(path) {
  if (!path) return isNativeApp() ? REMOTE_ORIGIN : "";
  if (/^https?:\/\//i.test(path)) return path;
  return isNativeApp() ? `${REMOTE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}` : path;
}

export function getNativeSessionToken() {
  if (!isNativeApp()) return "";
  try {
    return window.localStorage.getItem(SESSION_KEY) || "";
  } catch (_) {
    return "";
  }
}

export function setNativeSessionToken(token) {
  if (!isNativeApp()) return;
  try {
    if (token) window.localStorage.setItem(SESSION_KEY, token);
    else window.localStorage.removeItem(SESSION_KEY);
  } catch (_) {}
}

export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getNativeSessionToken();

  if (isNativeApp()) {
    headers.set("X-Urban-Director-Platform", Capacitor.getPlatform());
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(apiUrl(path), {
    ...options,
    headers,
    credentials: isNativeApp() ? "omit" : (options.credentials || "include")
  });
}

export function signalUrl({ room, network, joinToken = "", signalTicket = "" }) {
  const base = new URL(publicOrigin());
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = "/signal";
  base.search = "";
  base.searchParams.set("room", room || "");
  base.searchParams.set("network", network || "");
  if (joinToken) base.searchParams.set("join", joinToken);
  if (signalTicket) base.searchParams.set("ticket", signalTicket);
  return base.toString();
}
