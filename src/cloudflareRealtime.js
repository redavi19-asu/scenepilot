import { apiFetch } from "./runtimeApi";

const REALTIME_TIMEOUT_MS = 10000;

async function realtimeApi(path, body, method = "POST") {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REALTIME_TIMEOUT_MS);

  try {
    const response = await apiFetch(path, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Realtime request failed (${response.status}).`);
    return data;
  } finally {
    window.clearTimeout(timer);
  }
}

function createRealtimePeer() {
  return new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
    bundlePolicy: "max-bundle"
  });
}

export async function publishProgramToRealtime(room, stream) {
  if (!stream?.getVideoTracks?.().length) throw new Error("Program video is unavailable.");

  const peer = createRealtimePeer();
  const transceivers = stream.getTracks().map(track =>
    peer.addTransceiver(track, { direction: "sendonly" })
  );

  try {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    const result = await realtimeApi("/api/realtime/publish", {
      room,
      sessionDescription: { type: offer.type, sdp: offer.sdp },
      tracks: transceivers.map(({ mid, sender }) => ({
        location: "local",
        mid,
        trackName: sender.track?.id
      }))
    });

    await peer.setRemoteDescription(result.sessionDescription);

    return {
      peer,
      stop: async () => {
        peer.close();
        await realtimeApi("/api/realtime/publish", { room }, "DELETE").catch(() => {});
      }
    };
  } catch (error) {
    peer.close();
    throw error;
  }
}

export async function subscribeToRealtimeProgram(room, video) {
  const peer = createRealtimePeer();
  const stream = new MediaStream();

  peer.addEventListener("track", event => {
    if (!stream.getTracks().some(track => track.id === event.track.id)) {
      stream.addTrack(event.track);
    }
    video.srcObject = stream;
    video.play().catch(() => {});
  });

  try {
    const subscription = await realtimeApi("/api/realtime/subscribe", { room });
    await peer.setRemoteDescription(subscription.sessionDescription);

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    await realtimeApi("/api/realtime/renegotiate", {
      sessionId: subscription.sessionId,
      token: subscription.token,
      sessionDescription: { type: answer.type, sdp: answer.sdp }
    });

    return {
      peer,
      stop: () => {
        peer.close();
        video.srcObject = null;
      }
    };
  } catch (error) {
    peer.close();
    video.srcObject = null;
    throw error;
  }
}
