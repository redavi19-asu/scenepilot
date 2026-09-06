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
      "ScenePilot WebRTC:",
      peer.connectionState
    );

    if (onConnectionState) {
      onConnectionState(peer.connectionState);
    }
  };

  return peer;
}
