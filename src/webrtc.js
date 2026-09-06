export function createPeerConnection({
  onIceCandidate,
  onTrack
}) {
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
    if (onTrack && event.streams?.[0]) {
      onTrack(event.streams[0]);
    }
  };

  return peer;
}
