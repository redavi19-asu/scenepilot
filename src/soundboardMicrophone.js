export function microphoneError(error) {
  if (["NotAllowedError", "SecurityError"].includes(error?.name)) return "Microphone permission was denied. Allow Urban Director Studio in your device or browser microphone settings, then try again.";
  if (["NotFoundError", "OverconstrainedError"].includes(error?.name)) return "That microphone is unavailable. Reconnect it or choose System default.";
  if (error?.name === "NotReadableError") return "The microphone could not open. Check its connection and whether another app is holding it.";
  return error?.message || "The microphone could not record. Your previous pad was kept.";
}

export function microphoneConstraints(deviceId = "") {
  return { audio: deviceId ? { deviceId: { exact: deviceId } } : true, video: false };
}

export function chooseAudioMime(Recorder) {
  return ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find(type => Recorder.isTypeSupported?.(type));
}

export async function startMicrophoneCapture({ native, mediaDevices, Recorder, deviceId = "", context, existingStream }) {
  if (native) {
    const info = await native.start({ inputId: deviceId });
    return {
      ...info,
      level: () => native.meter(),
      cancel: () => native.cancel(),
      stop: async () => {
        const result = await native.stop();
        const bytes = Uint8Array.from(atob(result.audioBase64 || ""), char => char.charCodeAt(0));
        if (bytes.length <= 44) throw new Error("No microphone audio was captured. Your previous pad was kept.");
        return new Blob([bytes], { type: result.mimeType || "audio/wav" });
      }
    };
  }
  if (!mediaDevices?.getUserMedia) throw new Error("Microphone capture is unavailable here. Update the TestFlight app to the latest build, or use a supported browser.");
  if (!Recorder) throw new Error("Audio recording is unavailable here. Update the TestFlight app to the latest build, or use a supported browser.");
  const shared = existingStream?.getAudioTracks().find(track => track.readyState === "live" && track.enabled && (!deviceId || track.getSettings?.().deviceId === deviceId));
  const stream = shared ? new MediaStream([shared.clone()]) : await mediaDevices.getUserMedia(microphoneConstraints(deviceId));
  let source, analyser, capture, sink;
  let finished = false;
  const startedAt = Date.now();
  const chunks = [];
  function release() {
    stream.getTracks().forEach(track => track.stop());
    source?.disconnect(); analyser?.disconnect(); sink?.disconnect();
  }
  try {
    const track = stream.getAudioTracks()[0];
    if (!track || track.readyState === "ended") throw new Error("No microphone input was opened.");
    const mimeType = chooseAudioMime(Recorder);
    capture = new Recorder(stream, mimeType ? { mimeType } : undefined);
    if (context) {
      source = context.createMediaStreamSource(stream);
      analyser = context.createAnalyser(); analyser.fftSize = 256;
      sink = context.createGain(); sink.gain.value = 0;
      source.connect(analyser); analyser.connect(sink); sink.connect(context.destination);
    }
    let failure;
    let resolveDone, rejectDone;
    const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
    // Keep asynchronous recorder failures handled until the user stops.
    void done.catch(() => {});
    capture.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
    capture.onerror = event => { failure = event.error || new Error("Microphone recording failed."); if (capture.state !== "inactive") capture.stop(); else { finished = true; release(); rejectDone(failure); } };
    capture.onstop = () => {
      finished = true;
      release();
      const blob = new Blob(chunks, { type: capture.mimeType || mimeType || "audio/webm" });
      if (failure) rejectDone(failure);
      else if (!blob.size) rejectDone(new Error("No microphone audio was captured. Your previous pad was kept."));
      else resolveDone(blob);
    };
    track.onended = () => { if (!finished && capture.state !== "inactive") { failure = new Error("The microphone disconnected. Reconnect it and try again."); capture.stop(); } };
    capture.start(250);
    return {
      inputLabel: track.label || "System microphone",
      level: async () => {
        let level = 0;
        if (analyser) {
          const samples = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(samples);
          level = Math.sqrt(samples.reduce((total, value) => total + value * value, 0) / samples.length);
        }
        return { level, elapsed: (Date.now() - startedAt) / 1000 };
      },
      stop: () => { if (!finished && capture.state !== "inactive") capture.stop(); return done; },
      cancel: () => { finished = true; if (capture.state !== "inactive") capture.stop(); release(); }
    };
  } catch (error) { release(); throw error; }
}
