// Serialize hardware changes so a slow light-on request cannot finish after off.
const trackChanges = new WeakMap();
export function queueCameraTrackChange(track, change) {
  const previous = trackChanges.get(track) || Promise.resolve();
  const next = previous.catch(() => {}).then(change);
  const settled = next.catch(() => {});
  trackChanges.set(track, settled);
  void settled.then(() => {
    if (trackChanges.get(track) === settled) trackChanges.delete(track);
  });
  return next;
}

// applyConstraints replaces previous constraints. Preserve unrelated settings,
// but remove old copies of the properties being changed (including advanced).
export function cameraConstraints(track, update) {
  const { advanced: previousAdvanced = [], ...previous } = track.getConstraints?.() || {};
  const { advanced: nextAdvanced = [], ...next } = update;
  const changed = new Set([...Object.keys(next), ...nextAdvanced.flatMap(Object.keys)]);
  for (const key of changed) delete previous[key];
  const retained = previousAdvanced.map(entry => Object.fromEntries(
    Object.entries(entry).filter(([key]) => !changed.has(key))
  )).filter(entry => Object.keys(entry).length);
  const advanced = [...retained, ...nextAdvanced];
  return { ...previous, ...next, ...(advanced.length ? { advanced } : {}) };
}

export function cameraTorchSupported(track) {
  const capability = track?.getCapabilities?.()?.torch;
  return capability === true || (Array.isArray(capability) && capability.includes(true));
}

export function setTrackTorch(track, enabled) {
  if (!track) return Promise.reject(new Error("Camera is unavailable"));
  return queueCameraTrackChange(track, async () => {
    const desired = Boolean(enabled);
    // Allow an off request even if capabilities change while the light is on.
    if (desired && !cameraTorchSupported(track)) throw new Error("Camera light is unsupported");
    const attempts = [
      { torch: { exact: desired }, advanced: [{ torch: desired }] },
      { torch: desired, advanced: [{ torch: desired }] },
      { advanced: [{ torch: desired }] }
    ];
    let lastError;
    for (const update of attempts) {
      try {
        await track.applyConstraints(cameraConstraints(track, update));
        let actual = track.getSettings?.()?.torch;
        // Some camera drivers report the hardware result a moment later.
        for (let retry = 0; typeof actual === "boolean" && actual !== desired && retry < 3; retry++) {
          await new Promise(resolve => setTimeout(resolve, 60));
          actual = track.getSettings?.()?.torch;
        }
        if (typeof actual === "boolean" && actual !== desired) {
          throw new Error(`Camera light did not turn ${desired ? "on" : "off"}`);
        }
        return typeof actual === "boolean" ? actual : desired;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  });
}
