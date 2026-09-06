export function createPeerConnection({
  onIceCandidate,
  onTrack,
  onConnectionState
} = {}) {
  const peer = new RTCPeerConnection({
    iceServers: [
      {
        urls: "stun:stun.l.google.com:19302"
      }
    ]
  });

  peer.onicecandidate = event => {
    if (event.candidate && onIceCandidate) {
      onIceCandidate(event.candidate);
    }
  };

  peer.ontrack = event => {
    const incomingStream = event.streams?.[0];

    if (incomingStream && onTrack) {
      onTrack(incomingStream);
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
