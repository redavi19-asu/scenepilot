// Produces one stable output audio track, even as live cameras disconnect,
// reconnect or the Director selects different channels while recording/streaming.
export const DEFAULT_CHANNEL = Object.freeze({ volume: 1, muted: true, solo: false });

export function collectProgramAudioSources(state = {}) {
  const sources = [];
  if (state.directorStream) {
    sources.push({ id: "director", slotId: "director", stream: state.directorStream });
  }
  if (state.screenStream) {
    sources.push({ id: "screen-share", slotId: "screen-share", stream: state.screenStream });
  }
  for (const camera of state.wirelessCameras || []) {
    const stream = state.remoteStreams?.[camera.socketId];
    if (camera.socketId && stream) {
      sources.push({ id: camera.socketId, slotId: camera.slotId, stream });
    }
  }
  return sources;
}

export function programAudioGain(source, state, anySolo) {
  const channel = state.cameraAudio?.[source.id] || DEFAULT_CHANNEL;
  const selected = state.masterAudioSource === "mix" ||
    state.masterAudioSource === source.id ||
    (state.masterAudioSource === "follow" &&
      String(source.slotId) === String(state.primarySlot));
  if (state.standby || !selected || channel.muted || (anySolo && !channel.solo)) return 0;
  const volume = Number(channel.volume);
  return Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0;
}

export function createProgramAudioMixer(AudioContextConstructor) {
  if (!AudioContextConstructor) return null;
  const context = new AudioContextConstructor();
  const destination = context.createMediaStreamDestination();
  const outputTrack = destination.stream.getAudioTracks()[0];
  if (!outputTrack) {
    void context.close?.();
    return null;
  }
  return { context, destination, outputTrack, inputs: new Map() };
}

export function syncProgramAudioMixer(mixer, state) {
  if (!mixer) return;
  const sources = collectProgramAudioSources(state);
  const active = new Set();
  const anySolo = sources.some(source => Boolean(state.cameraAudio?.[source.id]?.solo));

  for (const source of sources) {
    const track = source.stream.getAudioTracks?.().find(item => item.readyState !== "ended");
    if (!track) continue;
    active.add(source.id);

    let entry = mixer.inputs.get(source.id);
    if (entry && (entry.stream !== source.stream || entry.track !== track)) {
      entry.node.disconnect();
      entry.gain.disconnect();
      mixer.inputs.delete(source.id);
      entry = null;
    }

    if (!entry) {
      try {
        // Use an audio-only stream so the compositor never routes video through
        // the audio context, nor accidentally mixes an extra audio track.
        const inputStream = new MediaStream([track]);
        const node = mixer.context.createMediaStreamSource(inputStream);
        const gain = mixer.context.createGain();
        gain.gain.value = 0;
        node.connect(gain);
        gain.connect(mixer.destination);
        entry = { stream: source.stream, track, inputStream, node, gain, lastVolume: null };
        mixer.inputs.set(source.id, entry);
      } catch (error) {
        console.warn("Urban Director Studio could not route microphone", source.id, error);
        continue;
      }
    }

    const volume = programAudioGain(source, state, anySolo);
    if (volume !== entry.lastVolume) {
      const parameter = entry.gain.gain;
      parameter.cancelScheduledValues?.(mixer.context.currentTime);
      if (parameter.setTargetAtTime) {
        parameter.setTargetAtTime(volume, mixer.context.currentTime, 0.012);
      } else {
        parameter.value = volume;
      }
      entry.lastVolume = volume;
    }
  }

  for (const [id, entry] of mixer.inputs) {
    if (active.has(id)) continue;
    entry.node.disconnect();
    entry.gain.disconnect();
    mixer.inputs.delete(id);
  }
}

export function stopProgramAudioMixer(mixer) {
  if (!mixer) return;
  for (const entry of mixer.inputs.values()) {
    entry.node.disconnect();
    entry.gain.disconnect();
  }
  mixer.inputs.clear();
  mixer.outputTrack.stop?.();
  void mixer.context.close?.();
}
