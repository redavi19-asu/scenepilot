let fallbackClientId;
const CLIENT_ID_KEY = 'uds-camera-client-v1';
export function cameraClientId(storage, randomUUID = () => crypto.randomUUID()) {
  try {
    const persistence = storage === undefined ? globalThis.localStorage : storage;
    const existing = persistence?.getItem(CLIENT_ID_KEY);
    if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(existing || '')) return existing;
    const id = randomUUID();
    persistence?.setItem(CLIENT_ID_KEY, id);
    return id;
  } catch {
    fallbackClientId ||= randomUUID();
    return fallbackClientId;
  }
}
export function withoutCameraSource(composition, slot) {
  if (composition.primary === slot) return { mode:'single', primary:null, secondary:null };
  if (composition.secondary === slot) return { mode:'single', primary:composition.primary, secondary:null };
  return composition;
}
export function cameraVideoStatus(camera, stream) {
  if (!camera) return 'OFFLINE';
  const tracks = stream?.getVideoTracks?.() || [];
  return tracks.some(track => track.readyState === 'live' && !track.muted) ? 'VIDEO READY' : 'WAITING FOR VIDEO';
}

export function programCameraSlots(composition, standby = false) {
  if (!composition || standby) return [];
  const slots = composition.mode === 'nine' ? Array.from({length:9}, (_,i)=>i+1) :
    composition.mode === 'single' ? [composition.primary] : [composition.primary, composition.secondary];
  return [...new Set(slots.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=9))];
}
export function listenForProgramStatus(socket, handler) {
  socket.on('program:update', handler);
  socket.on('program:status', handler);
  return () => { socket.off('program:update', handler); socket.off('program:status', handler); };
}
