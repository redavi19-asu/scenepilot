// Render local timeline media without decoding whole source files into memory.
export function movieDuration(clips) {
  return clips.reduce((end, clip) => Math.max(end, Number(clip.start) + Number(clip.duration)), 0);
}

export function activeClips(clips, time) {
  return clips.filter(clip => time >= clip.start && time < clip.start + clip.duration);
}

export function clipSourceTime(clip, time) {
  return Math.min(clip.outPoint ?? Infinity, (clip.inPoint || 0) + Math.max(0, time - clip.start) * (clip.speed || 1));
}

export function clipGain(clip, time) {
  const elapsed = Math.max(0, time - clip.start);
  const remaining = Math.max(0, clip.start + clip.duration - time);
  const fade = Math.min(1, clip.fadeIn > 0 ? elapsed / clip.fadeIn : 1, clip.fadeOut > 0 ? remaining / clip.fadeOut : 1);
  return Math.max(0, Math.min(2, clip.volume ?? 1)) * Math.max(0, fade);
}

export function movieSize(aspect = "16:9") {
  return ({ "16:9": [1280, 720], "9:16": [720, 1280], "1:1": [720, 720], "4:5": [720, 900] })[aspect] || [1280, 720];
}

export function movieMime(Recorder = globalThis.MediaRecorder) {
  return ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
    .find(type => Recorder?.isTypeSupported(type)) || "";
}

function waitForMedia(element, event, signal, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const finish = error => {
      clearTimeout(timer);
      element.removeEventListener(event, ready);
      element.removeEventListener("error", failed);
      signal?.removeEventListener("abort", aborted);
      if (error) reject(error); else resolve();
    };
    const ready = () => finish();
    const failed = () => finish(new Error("An imported source could not be decoded. Try a compatible MP4, audio file, or image."));
    const aborted = () => finish(new DOMException("Export cancelled", "AbortError"));
    const timer = setTimeout(() => finish(new Error("A source did not become ready for export.")), timeout);
    element.addEventListener(event, ready, { once: true });
    element.addEventListener("error", failed, { once: true });
    signal?.addEventListener("abort", aborted, { once: true });
    if (signal?.aborted) aborted();
  });
}

function drawClip(ctx, source, clip, width, height) {
  ctx.save();
  ctx.globalAlpha = clip.opacity ?? 1;
  ctx.translate(width / 2 + (clip.x || 0) * width / 100, height / 2 + (clip.y || 0) * height / 100);
  ctx.rotate((clip.rotation || 0) * Math.PI / 180);
  ctx.scale(clip.scale || 1, clip.scale || 1);
  if (clip.kind === "text") {
    const caption = clip.textStyle === "caption";
    const lower = clip.textStyle === "lower-third";
    const y = caption || lower ? height * .31 : 0;
    const size = Math.round(height * (caption ? .045 : .065));
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (lower || caption) {
      ctx.fillStyle = lower ? "#b91c1c" : "rgba(0,0,0,.8)";
      ctx.fillRect(-width * .44, y - size, width * .88, size * 2);
    }
    ctx.shadowColor = "black";
    ctx.shadowBlur = 4;
    ctx.fillStyle = "white";
    ctx.fillText(clip.text || "", 0, y, width * .84);
  } else {
    const sw = source.videoWidth || source.naturalWidth;
    const sh = source.videoHeight || source.naturalHeight;
    const fit = Math.min(width / sw, height / sh);
    ctx.filter = `brightness(${clip.brightness ?? 1}) contrast(${clip.contrast ?? 1}) saturate(${clip.saturation ?? 1})`;
    ctx.drawImage(source, -sw * fit / 2, -sh * fit / 2, sw * fit, sh * fit);
  }
  ctx.restore();
}

export async function renderMovie({ clips, assets, aspectRatio, isOwner, signal, onProgress, writeChunk, AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext }) {
  if (!clips.length || !(movieDuration(clips) > 0)) throw new Error("Add media or a title to the timeline first.");
  if (!isOwner && clips.some(clip => clip.exportAllowed === false || assets.find(asset => asset.id === clip.assetId)?.exportAllowed === false)) {
    throw new Error("Protected Program masters cannot be exported by customer accounts.");
  }
  const mimeType = movieMime();
  if (!mimeType || !HTMLCanvasElement.prototype.captureStream || !AudioContextClass) {
    throw new Error("Video export is unavailable on this device. Open the project in a current supported browser or desktop app.");
  }
  const duration = movieDuration(clips);
  const [width, height] = movieSize(aspectRatio);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const audio = new AudioContextClass();
  // Resume during the user's export gesture, before media preparation yields.
  const resume = audio.resume();
  const destination = audio.createMediaStreamDestination();
  const limiter = audio.createDynamicsCompressor();
  limiter.connect(destination);
  const resources = new Map();
  const stream = canvas.captureStream(30);
  destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
  let recorder, recorded, frame = 0, wakeLock;
  let writing = Promise.resolve(), writeError = null, queuedBytes = 0;
  try {
    await resume;
    if (audio.state !== "running") throw new Error("Audio is suspended. Tap export again with the app in the foreground.");
    onProgress?.({ phase: "Preparing media", progress: 0 });
    for (const clip of clips) {
      if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
      if (clip.kind === "text") continue;
      const url = assets.find(asset => asset.id === clip.assetId)?.url || clip.url;
      if (!url) throw new Error(`Re-import the source for ${clip.name || "this clip"} before exporting.`);
      const element = document.createElement(clip.kind === "image" ? "img" : clip.kind === "audio" ? "audio" : "video");
      resources.set(clip.id, { element, playing: false });
      if (clip.kind === "image") {
        const loaded = waitForMedia(element, "load", signal);
        element.src = url;
        await loaded;
      } else {
        element.preload = "auto";
        element.playsInline = true;
        const loaded = waitForMedia(element, "loadeddata", signal);
        element.src = url;
        element.load();
        await loaded;
        if (clip.inPoint > .01) {
          const seeked = waitForMedia(element, "seeked", signal);
          element.currentTime = clip.inPoint;
          await seeked;
        }
        element.playbackRate = clip.speed || 1;
        const source = audio.createMediaElementSource(element);
        const gain = audio.createGain();
        gain.gain.value = 0;
        source.connect(gain).connect(limiter);
        resources.get(clip.id).gain = gain;
      }
    }
    wakeLock = await navigator.wakeLock?.request("screen").catch(() => null);
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, width, height);
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4000000, audioBitsPerSecond: 128000 });
    recorded = new Promise((resolve, reject) => {
      recorder.onstop = resolve;
      recorder.onerror = event => reject(event.error || new Error("Video encoding failed."));
    });
    // Observe an encoder failure even when it occurs during the rendering loop.
    recorded.catch(error => { writeError = error; });
    recorder.ondataavailable = event => {
      if (!event.data.size) return;
      queuedBytes += event.data.size;
      if (queuedBytes > 32 * 1024 * 1024) writeError = new Error("Storage cannot keep up with the export. Try a shorter segment.");
      writing = writing.then(() => writeChunk(event.data)).then(() => { queuedBytes -= event.data.size; }).catch(error => { writeError = error; });
    };
    const started = audio.currentTime;
    recorder.start(2000);
    await new Promise((resolve, reject) => {
      const abort = () => finish(new DOMException("Export cancelled", "AbortError"));
      const hidden = () => { if (document.hidden) finish(new Error("Export stopped because the app left the foreground. Keep it open until export finishes.")); };
      signal?.addEventListener("abort", abort, { once: true });
      document.addEventListener("visibilitychange", hidden);
      let finished = false;
      const finish = error => {
        if (finished) return;
        finished = true;
        cancelAnimationFrame(frame);
        signal?.removeEventListener("abort", abort);
        document.removeEventListener("visibilitychange", hidden);
        if (error) reject(error); else resolve();
      };
      const draw = () => {
        try {
          if (signal?.aborted) return finish(new DOMException("Export cancelled", "AbortError"));
          if (writeError) return finish(writeError);
          if (audio.state !== "running") return finish(new Error("Audio was interrupted. Keep the app open and try again."));
          const time = audio.currentTime - started;
          if (time >= duration) return finish();
          const active = activeClips(clips, time);
          const ids = new Set(active.map(clip => clip.id));
          for (const [id, resource] of resources) {
            if (resource.gain && !ids.has(id)) {
              resource.gain.gain.value = 0;
              resource.element.pause();
              resource.playing = false;
            }
          }
          ctx.fillStyle = "black";
          ctx.fillRect(0, 0, width, height);
          for (const clip of active.sort((a, b) => ["v1", "v2", "text"].indexOf(a.trackId) - ["v1", "v2", "text"].indexOf(b.trackId))) {
            const resource = resources.get(clip.id);
            if (resource?.gain) {
              resource.gain.gain.value = clipGain(clip, time);
              if (!resource.playing) {
                resource.playing = true;
                resource.element.play().catch(error => finish(error));
              }
              if (time - clip.start > 1 && Math.abs(resource.element.currentTime - clipSourceTime(clip, time)) > .8) {
                return finish(new Error(`Playback stalled in ${clip.name || "a source"}. Export a shorter segment or use a lower-resolution source.`));
              }
            }
            if (clip.kind === "text") drawClip(ctx, null, clip, width, height);
            else if (["video", "image"].includes(clip.kind)) drawClip(ctx, resource.element, clip, width, height);
          }
          onProgress?.({ phase: "Rendering video", progress: Math.min(99, Math.round(time / duration * 100)), elapsed: time, duration });
          if (!finished) frame = requestAnimationFrame(draw);
        } catch (error) { finish(error); }
      };
      draw();
    });
    recorder.stop();
    await recorded;
    await writing;
    if (writeError) throw writeError;
    onProgress?.({ phase: "Video ready", progress: 100 });
    return { mimeType: recorder.mimeType, duration, width, height };
  } finally {
    cancelAnimationFrame(frame);
    if (recorder?.state === "recording") recorder.stop();
    await recorded?.catch(() => {});
    await writing;
    stream.getTracks().forEach(track => track.stop());
    for (const { element } of resources.values()) {
      element.pause?.();
      element.removeAttribute("src");
      element.load?.();
    }
    await audio.close();
    await wakeLock?.release();
  }
}
