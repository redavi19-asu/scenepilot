// Loaded local artwork is drawn onto the same canvas used for recording and live ingest.
// A DOM overlay alone is invisible to MediaRecorder and WebRTC captureStream().
export function disposeGraphicAsset(asset) {
  const element = asset?.element;
  if (!element) return;
  element.onload = null;
  element.onerror = null;
  element.onloadeddata = null;
  element.oncanplay = null;
  if (asset.kind === "video") {
    element.pause?.();
    element.removeAttribute("src");
    element.load?.();
  }
  asset.element = null;
  asset.ready = false;
}

export function updateGraphicAsset(current, source, kind = "image") {
  const src = String(source || "");
  const mediaKind = kind === "video" ? "video" : "image";
  if (current?.src === src && current?.kind === mediaKind) return current;
  disposeGraphicAsset(current);
  const asset = { src, kind: mediaKind, element: null, ready: false };
  if (!src) return asset;

  if (mediaKind === "video") {
    const video = document.createElement("video");
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = "auto";
    const onReady = () => {
      if (asset.element !== video) return;
      asset.ready = video.videoWidth > 0 && video.videoHeight > 0;
      if (asset.ready) {
        try { video.play()?.catch?.(() => {}); } catch { /* Unsupported video codec. */ }
      }
    };
    video.onloadeddata = onReady;
    video.oncanplay = onReady;
    video.onerror = () => { asset.ready = false; };
    asset.element = video;
    video.src = src;
    video.load?.();
    try { video.play()?.catch?.(() => {}); } catch { /* Wait for ready data. */ }
  } else {
    const image = new Image();
    image.onload = () => {
      if (asset.element === image) asset.ready = image.naturalWidth > 0 && image.naturalHeight > 0;
    };
    image.onerror = () => { asset.ready = false; };
    asset.element = image;
    image.src = src;
  }
  return asset;
}

export function drawGraphicAsset(ctx, asset, x, y, width, height, fit = "contain") {
  if (!asset?.ready || !asset.element || width <= 0 || height <= 0) return false;
  const element = asset.element;
  const sourceWidth = asset.kind === "video" ? element.videoWidth : element.naturalWidth;
  const sourceHeight = asset.kind === "video" ? element.videoHeight : element.naturalHeight;
  if (!(sourceWidth > 0 && sourceHeight > 0)) return false;

  const scale = fit === "cover"
    ? Math.max(width / sourceWidth, height / sourceHeight)
    : Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  try {
    ctx.drawImage(
      element,
      x + (width - drawWidth) / 2,
      y + (height - drawHeight) / 2,
      drawWidth,
      drawHeight
    );
    return true;
  } catch {
    return false;
  }
}
