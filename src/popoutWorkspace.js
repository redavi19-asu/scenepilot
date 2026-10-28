export const WORKSPACE_STORAGE_KEY = "uds-desktop-workspace-v1";
export const POPOUT_VIEWS = ["program", "preview", "main", "multiview", "director", "screen", ...Array.from({ length: 9 }, (_, i) => `camera-${i + 1}`)];
export const DEFAULT_BOUNDS = Object.freeze({ left: 90, top: 80, width: 940, height: 560 });
export function validPopoutView(value) {
  return typeof value === "string" && POPOUT_VIEWS.includes(value);
}
export function safeBounds(raw = {}) {
  const clamp = (v, low, high, fallback) => {
    const num = Number(v);
    return Number.isFinite(num) ? Math.max(low, Math.min(high, Math.round(num))) : fallback;
  };
  return {
    // Some external screens use negative coordinates. Do not clamp those to 0.
    left: clamp(raw.left, -12000, 12000, DEFAULT_BOUNDS.left),
    top: clamp(raw.top, -12000, 12000, DEFAULT_BOUNDS.top),
    width: clamp(raw.width, 330, 5000, DEFAULT_BOUNDS.width),
    height: clamp(raw.height, 240, 3200, DEFAULT_BOUNDS.height)
  };
}
export function parseWorkspace(value) {
  try {
    const data = typeof value === "string" ? JSON.parse(value) : value;
    if (!data || data.version !== 1 || !Array.isArray(data.views)) return { version: 1, views: [], bounds: {} };
    const views = [...new Set(data.views.filter(validPopoutView))].slice(0, POPOUT_VIEWS.length);
    const bounds = {};
    for (const id of views) bounds[id] = safeBounds(data.bounds?.[id]);
    return { version: 1, views, bounds };
  } catch {
    return { version: 1, views: [], bounds: {} };
  }
}
export function readWorkspace(storage) {
  try { return parseWorkspace(storage?.getItem(WORKSPACE_STORAGE_KEY)); }
  catch { return parseWorkspace(null); }
}
export function isDesktopWindowSupported(capacitorNative, matchMedia) {
  return !capacitorNative && typeof matchMedia === "function" && Boolean(matchMedia("(pointer: fine)")?.matches);
}
export function popupFeatures(bounds) {
  const b = safeBounds(bounds);
  return `popup=yes,resizable=yes,scrollbars=no,left=${b.left},top=${b.top},width=${b.width},height=${b.height}`;
}
export function getWindowBounds(popup) {
  return safeBounds({ left: popup.screenX, top: popup.screenY, width: popup.outerWidth, height: popup.outerHeight });
}
