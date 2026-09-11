import { Capacitor, registerPlugin } from "@capacitor/core";

const SmartGlasses = registerPlugin("UrbanSmartGlasses");
let frameListener = null;
let canvas = null;
let ctx = null;

function ensureCanvas(width = 360, height = 640) {
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.position = "fixed";
    canvas.style.width = "1px";
    canvas.style.height = "1px";
    canvas.style.opacity = "0";
    canvas.style.pointerEvents = "none";
    canvas.style.left = "-9999px";
    document.body.appendChild(canvas);
    ctx = canvas.getContext("2d", { alpha: false });
  }
  if (width && height && (canvas.width !== width || canvas.height !== height)) {
    canvas.width = width;
    canvas.height = height;
  }
  return canvas;
}

async function drawFrame(detail) {
  const src = detail?.dataUrl || (detail?.base64 ? `data:image/jpeg;base64,${detail.base64}` : "");
  if (!src) return;
  const target = ensureCanvas(detail?.width || 360, detail?.height || 640);
  const image = new Image();
  image.decoding = "async";
  image.onload = () => {
    ctx?.drawImage(image, 0, 0, target.width, target.height);
  };
  image.src = src;
}

export function smartGlassesSupportedHere() {
  return Capacitor.isNativePlatform();
}

export async function getSmartGlassesStatus() {
  if (!smartGlassesSupportedHere()) {
    return { available: false, reason: "NATIVE_APP_REQUIRED" };
  }
  try {
    return await SmartGlasses.getStatus();
  } catch (error) {
    return {
      available: false,
      reason: "NATIVE_BRIDGE_NOT_INSTALLED",
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function registerSmartGlasses() {
  return SmartGlasses.startRegistration();
}

export async function startSmartGlassesStream({ fps = 24 } = {}) {
  if (!smartGlassesSupportedHere()) {
    throw new Error("Smart glasses require the native iOS or Android app.");
  }

  const support = await getSmartGlassesStatus();
  if (!support?.available) {
    throw new Error(
      support?.message ||
      "Meta smart-glasses bridge is not installed in this build yet."
    );
  }

  await frameListener?.remove?.();
  frameListener = await SmartGlasses.addListener("frame", drawFrame);

  const target = ensureCanvas(
    Number(support.width) || 360,
    Number(support.height) || 640
  );

  await SmartGlasses.startStream({ fps });
  const videoStream = target.captureStream?.(fps);
  if (!videoStream?.getVideoTracks?.().length) {
    await SmartGlasses.stopStream().catch(() => {});
    throw new Error("This device cannot bridge smart-glasses video into WebRTC.");
  }

  return videoStream;
}

export async function stopSmartGlassesStream() {
  try {
    await SmartGlasses.stopStream();
  } catch (_) {}
  try {
    await frameListener?.remove?.();
  } catch (_) {}
  frameListener = null;
}
