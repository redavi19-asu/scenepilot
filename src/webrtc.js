export function createPeerConnection({
  onIceCandidate,
  onTrack,
  onConnectionState
} = {}) {
  const peer = new RTCPeerConnection({
    iceServers: [
      {
        urls: [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302"
        ]
      }
    ]
  });

  const fallbackStream = new MediaStream();

  peer.onicecandidate = event => {
    if (event.candidate && onIceCandidate) {
      onIceCandidate(event.candidate);
    }
  };

  peer.ontrack = event => {
    let incomingStream = event.streams?.[0];

    if (!incomingStream) {
      if (!fallbackStream.getTracks().some(track => track.id === event.track.id)) {
        fallbackStream.addTrack(event.track);
      }

      incomingStream = fallbackStream;
    }

    if (onTrack) {
      onTrack(incomingStream, event.track);
    }
  };

  peer.onconnectionstatechange = () => {
    console.log(
      "Urban Director Studio WebRTC:",
      peer.connectionState
    );

    if (onConnectionState) {
      onConnectionState(peer.connectionState);
    }
  };

  return peer;
}


export async function optimizeVideoSender(sender, qualityProfile = "auto") {
  if (!sender?.track || sender.track.kind !== "video") return;

  try {
    const params = sender.getParameters?.() || {};
    if (!params.encodings?.length) {
      params.encodings = [{}];
    }

    const connection =
      navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection;

    const effectiveType = String(connection?.effectiveType || "").toLowerCase();
    const connectionType = String(connection?.type || "").toLowerCase();
    const isSlowNetwork = ["slow-2g", "2g", "3g"].includes(effectiveType);
    const isCellular = connectionType === "cellular";
    const isMobileDevice =
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");

    let maxBitrate = 2600000;
    let maxFramerate = 30;
    let scaleResolutionDownBy = 1;

    if (qualityProfile === "1080p") {
      maxBitrate = 3200000;
    } else if (qualityProfile === "720p") {
      maxBitrate = 2200000;
    }

    if (isSlowNetwork) {
      maxBitrate = 850000;
      maxFramerate = 20;
      scaleResolutionDownBy = 1.75;
    } else if (isCellular || (isMobileDevice && !connection)) {
      maxBitrate = 1600000;
      maxFramerate = 24;
      scaleResolutionDownBy = qualityProfile === "1080p" ? 1.35 : 1.15;
    }

    params.encodings[0] = {
      ...params.encodings[0],
      maxBitrate,
      maxFramerate,
      scaleResolutionDownBy
    };

    params.degradationPreference = "maintain-framerate";

    await sender.setParameters?.(params);
  } catch (error) {
    console.warn("Urban Director Studio adaptive video tuning unavailable", error);
  }
}
