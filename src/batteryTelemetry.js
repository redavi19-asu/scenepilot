// Both the Battery API and Capacitor report a fraction; -1 means unknown on iOS.
export function batteryPercentage(level) {
  if (typeof level !== 'number' || !Number.isFinite(level) || level < 0 || level > 1) return null;
  return Math.round(level * 100);
}

export function cameraBatteryLabel(camera) {
  if (!camera) return 'OFFLINE';
  if (Number.isFinite(camera.battery) && camera.battery >= 0 && camera.battery <= 100) {
    return `${camera.battery}%${camera.charging ? ' ⚡' : ''}`;
  }
  if (camera.telemetryConsent === false) return 'NOT SHARED';
  if (camera.telemetrySupport?.battery === false) return 'USE PHONE APP';
  return 'WAITING';
}

export function nativeCameraLink(search) {
  const source = new URLSearchParams(search);
  const query = new URLSearchParams({ camera: '1' });
  for (const key of ['network', 'room', 'join']) {
    const value = source.get(key);
    if (!value || value.length > 512) return '';
    query.set(key, value);
  }
  return `urbandirectorstudio://camera?${query}`;
}
