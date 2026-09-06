export function createPeerConnection({ onTrack }) {
  const peer = new RTCPeerConnection({
    iceServers: [
      {
        urls: "stun:stun.l.google.com:19302"
      }
    ]
  });

  peer.ontrack = event => {
    if (onTrack && event.streams?.[0]) {
      onTrack(event.streams[0]);
    }
  };

  return peer;
}

export function waitForIceGathering(peer) {
  if (peer.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise(resolve => {
    const check = () => {
      if (peer.iceGatheringState === "complete") {
        peer.removeEventListener(
          "icegatheringstatechange",
          check
        );

        resolve();
      }
    };

    peer.addEventListener(
      "icegatheringstatechange",
      check
    );

    setTimeout(resolve, 3000);
  });
}
