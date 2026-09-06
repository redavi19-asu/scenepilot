import { useEffect, useRef, useState } from "react";
import {
  Radio, Circle, Mic2, Volume2, Wifi, BatteryFull,
  Settings, Maximize2, MonitorUp, Users, QrCode,
  Type, Layers, PictureInPicture2, Video, Camera,
  Smartphone, X, CircleHelp, RefreshCw, ZoomIn, ZoomOut
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import "./App.css";
import { socket } from "./socket";
import { createPeerConnection } from "./webrtc";

const qualityProfiles = {
  "1080p": { width: 1920, height: 1080, fps: 30, label: "1080P" },
  "720p": { width: 1280, height: 720, fps: 30, label: "720P" },
  "auto": { width: 1280, height: 720, fps: 30, label: "AUTO" }
};

const initialCameras = [
  { id: 1, name: "STAGE LEFT", status: "LIVE", battery: 92, signal: 4 },
  { id: 2, name: "STAGE RIGHT", status: "READY", battery: 84, signal: 4 },
  { id: 3, name: "DRUMMER", status: "READY", battery: 71, signal: 3 },
  { id: 4, name: "PERCUSSION", status: "READY", battery: 66, signal: 4 },
  { id: 5, name: "CROWD A", status: "READY", battery: 95, signal: 3 },
  { id: 6, name: "CROWD B", status: "OFFLINE", battery: 0, signal: 0 },
  { id: 7, name: "ROAMING 1", status: "READY", battery: 78, signal: 4 },
  { id: 8, name: "ROAMING 2", status: "OFFLINE", battery: 0, signal: 0 },
  { id: 9, name: "WIDE / HOUSE", status: "READY", battery: 88, signal: 4 },
];

function App() {
  const [cameras, setCameras] = useState(initialCameras);
  const [program, setProgram] = useState(1);
  const [preview, setPreview] = useState(2);
  const [transition, setTransition] = useState("DISSOLVE");
  const [duration, setDuration] = useState(500);
  const [recording, setRecording] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showCamera, setShowCamera] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("camera") === "1";
  });
  const [stream, setStream] = useState(null);
  const cameraVideo = useRef(null);
  const remoteVideos = useRef({});
  const peers = useRef({});
  const pendingIce = useRef({});
  const [remoteStreams, setRemoteStreams] = useState({});
  const [wirelessCameras, setWirelessCameras] = useState([]);
  const [signalStatus, setSignalStatus] = useState("OFFLINE");
  const [assignedSlot, setAssignedSlot] = useState(7);
  const [cameraName, setCameraName] = useState("ROAMING 1");
  const [qualityProfile, setQualityProfile] = useState("1080p");
  const [showTips, setShowTips] = useState(false);
  const [facingMode, setFacingMode] = useState("environment");
  const [zoomRange, setZoomRange] = useState(null);
  const [zoomValue, setZoomValue] = useState(1);
  const [videoInputs, setVideoInputs] = useState([]);
  const [selectedVideoDevice, setSelectedVideoDevice] = useState("");

  const roomCode =
    new URLSearchParams(window.location.search).get("room") || "SP-4827";

  const joinUrl =
    `${window.location.origin}${window.location.pathname}?camera=1&room=${encodeURIComponent(roomCode)}`;

  async function refreshVideoInputs() {
    try {
      const devices = await navigator.mediaDevices?.enumerateDevices?.();
      const cameras = (devices || []).filter(device => device.kind === "videoinput");
      setVideoInputs(cameras);
    } catch (error) {
      console.warn("ScenePilot camera source discovery unavailable", error);
    }
  }

  useEffect(() => {
    if (!showCamera || !navigator.mediaDevices) return;

    refreshVideoInputs();

    const handleDeviceChange = () => refreshVideoInputs();
    navigator.mediaDevices.addEventListener?.("devicechange", handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener?.("devicechange", handleDeviceChange);
    };
  }, [showCamera]);

   useEffect(() => {
    if (showCamera) return;

    const queueIce = (peerId, candidate) => {
      if (!candidate) return;
      if (!pendingIce.current[peerId]) {
        pendingIce.current[peerId] = [];
      }
      pendingIce.current[peerId].push(candidate);
    };

    const flushIce = async peerId => {
      const peer = peers.current[peerId];
      if (!peer?.remoteDescription) return;

      const queued = pendingIce.current[peerId] || [];
      delete pendingIce.current[peerId];

      for (const candidate of queued) {
        try {
          await peer.addIceCandidate(candidate);
        } catch (error) {
          console.error("Director queued ICE error", error);
        }
      }
    };

    const startPeer = async camera => {
      if (!camera?.socketId) return;

      peers.current[camera.socketId]?.close();

      const peer = createPeerConnection({
        onIceCandidate: candidate => {
          socket.emit("webrtc:ice", {
            target: camera.socketId,
            candidate
          });
        },

        onTrack: incomingStream => {
          setRemoteStreams(prev => ({
            ...prev,
            [camera.socketId]: incomingStream
          }));

          if (camera.slotId) {
            setPreview(camera.slotId);
          }

          setSignalStatus("VIDEO CONNECTED");
        },

        onConnectionState: state => {
          if (state === "connecting") {
            setSignalStatus("WEBRTC CONNECTING");
          } else if (state === "connected") {
            setSignalStatus("PEER CONNECTED");
          } else if (state === "failed") {
            setSignalStatus("WEBRTC FAILED");
          } else if (state === "disconnected") {
            setSignalStatus("WEBRTC DISCONNECTED");
          }
        }
      });

      peers.current[camera.socketId] = peer;

      peer.addTransceiver("video", {
        direction: "recvonly"
      });

      peer.addTransceiver("audio", {
        direction: "recvonly"
      });

      try {
        const offer = await peer.createOffer();

        await peer.setLocalDescription(offer);

        socket.emit("webrtc:offer", {
          target: camera.socketId,
          offer: peer.localDescription
        });

        setSignalStatus("OFFER SENT");
      } catch (error) {
        console.error("Director offer error", error);
        setSignalStatus("OFFER FAILED");
      }
    };

    const handleRoomCameras = list => {
      setWirelessCameras(list);
      setSignalStatus(list.length ? "CAMERA FOUND" : "WAITING FOR CAMERA");

      list.forEach(camera => {
        startPeer(camera);
      });
    };

    const handleCameraJoined = camera => {
      setWirelessCameras(prev => {
        const rest = prev.filter(c => c.socketId !== camera.socketId);
        return [...rest, camera];
      });

      setSignalStatus("CAMERA JOINED");
      startPeer(camera);
    };

    const handleAnswer = async ({ from, answer }) => {
      const peer = peers.current[from];
      if (!peer) return;

      try {
        await peer.setRemoteDescription(answer);
        await flushIce(from);
        setSignalStatus("ANSWER RECEIVED");
      } catch (error) {
        console.error("Director answer error", error);
        setSignalStatus("ANSWER FAILED");
      }
    };

    const handleIce = async ({ from, candidate }) => {
      if (!candidate) return;

      const peer = peers.current[from];

      if (!peer || !peer.remoteDescription) {
        queueIce(from, candidate);
        return;
      }

      try {
        await peer.addIceCandidate(candidate);
      } catch (error) {
        console.error("Director ICE error", error);
      }
    };

    const handleCameraLeft = ({ socketId }) => {
      peers.current[socketId]?.close();
      delete peers.current[socketId];
      delete pendingIce.current[socketId];

      setWirelessCameras(prev =>
        prev.filter(c => c.socketId !== socketId)
      );

      setRemoteStreams(prev => {
        const next = { ...prev };
        delete next[socketId];
        return next;
      });

      setSignalStatus("CAMERA LEFT");
    };

    const handleConnect = () => {
      setSignalStatus("SIGNAL CONNECTED");
      socket.emit("director:join", {
        room: roomCode
      });
    };

    const handleDisconnect = () => {
      setSignalStatus("SIGNAL DISCONNECTED");
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("room:cameras", handleRoomCameras);
    socket.on("camera:joined", handleCameraJoined);
    socket.on("webrtc:answer", handleAnswer);
    socket.on("webrtc:ice", handleIce);
    socket.on("camera:left", handleCameraLeft);

    socket.setRoom(roomCode);
    socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("room:cameras", handleRoomCameras);
      socket.off("camera:joined", handleCameraJoined);
      socket.off("webrtc:answer", handleAnswer);
      socket.off("webrtc:ice", handleIce);
      socket.off("camera:left", handleCameraLeft);

      Object.values(peers.current).forEach(peer => peer.close());
      peers.current = {};
      pendingIce.current = {};

      socket.disconnect();
    };
  }, [showCamera, roomCode]);

  useEffect(() => {
    if (cameraVideo.current && stream) {
      cameraVideo.current.srcObject = stream;
    }
  }, [stream, showCamera]);

  function readZoomCapability(mediaStream) {
    const videoTrack = mediaStream?.getVideoTracks?.()[0];
    const capabilities = videoTrack?.getCapabilities?.();
    const zoom = capabilities?.zoom;

    if (
      zoom &&
      Number.isFinite(zoom.min) &&
      Number.isFinite(zoom.max)
    ) {
      const settings = videoTrack.getSettings?.() || {};
      const value = Number.isFinite(settings.zoom)
        ? settings.zoom
        : zoom.min;

      setZoomRange({
        min: zoom.min,
        max: zoom.max,
        step: zoom.step || 0.1
      });
      setZoomValue(value);
    } else {
      setZoomRange(null);
      setZoomValue(1);
    }
  }

  async function changeZoom(direction) {
    const videoTrack = stream?.getVideoTracks?.()[0];
    if (!videoTrack || !zoomRange) return;

    const step = Math.max(zoomRange.step || 0.1, 0.1);
    const next = Math.min(
      zoomRange.max,
      Math.max(
        zoomRange.min,
        zoomValue + (direction * step)
      )
    );

    try {
      await videoTrack.applyConstraints({
        advanced: [{ zoom: next }]
      });
      setZoomValue(next);
    } catch (error) {
      console.warn("ScenePilot zoom unavailable", error);
    }
  }

  async function flipCamera() {
    if (!stream) return;

    const nextFacing =
      facingMode === "environment" ? "user" : "environment";
    const profile = qualityProfiles[qualityProfile];

    try {
      setSignalStatus("SWITCHING CAMERA");

      setSelectedVideoDevice("");

      const replacement = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: nextFacing },
          width: { ideal: profile.width },
          height: { ideal: profile.height },
          frameRate: { ideal: profile.fps, max: profile.fps }
        },
        audio: false
      });

      const newVideoTrack = replacement.getVideoTracks()[0];
      if (!newVideoTrack) {
        throw new Error("No replacement camera track available");
      }

      const replaceJobs = [];

      Object.values(peers.current).forEach(peer => {
        const sender = peer
          .getSenders()
          .find(candidate => candidate.track?.kind === "video");

        if (sender) {
          replaceJobs.push(sender.replaceTrack(newVideoTrack));
        }
      });

      await Promise.all(replaceJobs);

      const oldVideoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();
      const nextStream = new MediaStream([
        newVideoTrack,
        ...audioTracks
      ]);

      oldVideoTracks.forEach(track => track.stop());

      setFacingMode(nextFacing);
      setStream(nextStream);
      readZoomCapability(nextStream);
      setSignalStatus(
        Object.keys(peers.current).length
          ? "LIVE TO DIRECTOR"
          : "CAMERA READY"
      );
    } catch (error) {
      console.error("ScenePilot camera flip failed", error);
      setSignalStatus("CAMERA SWITCH FAILED");
    }
  }

  async function enableCamera() {
    try {
      setSignalStatus("REQUESTING CAMERA");

      const profile = qualityProfiles[qualityProfile];

      const videoConstraints = selectedVideoDevice
        ? {
            deviceId: { exact: selectedVideoDevice },
            width: { ideal: profile.width },
            height: { ideal: profile.height },
            frameRate: { ideal: profile.fps, max: profile.fps }
          }
        : {
            facingMode: { ideal: facingMode },
            width: { ideal: profile.width },
            height: { ideal: profile.height },
            frameRate: { ideal: profile.fps, max: profile.fps }
          };

      const media = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: true
      });

      setStream(media);
      readZoomCapability(media);
      await refreshVideoInputs();

      const queueIce = (peerId, candidate) => {
        if (!candidate) return;
        if (!pendingIce.current[peerId]) {
          pendingIce.current[peerId] = [];
        }
        pendingIce.current[peerId].push(candidate);
      };

      const flushIce = async peerId => {
        const peer = peers.current[peerId];
        if (!peer?.remoteDescription) return;

        const queued = pendingIce.current[peerId] || [];
        delete pendingIce.current[peerId];

        for (const candidate of queued) {
          try {
            await peer.addIceCandidate(candidate);
          } catch (error) {
            console.error("Camera queued ICE error", error);
          }
        }
      };

      const handleOffer = async ({ from, offer }) => {
        peers.current[from]?.close();

        const peer = createPeerConnection({
          onIceCandidate: candidate => {
            socket.emit("webrtc:ice", {
              target: from,
              candidate
            });
          },

          onConnectionState: state => {
            if (state === "connecting") {
              setSignalStatus("WEBRTC CONNECTING");
            } else if (state === "connected") {
              setSignalStatus("LIVE TO DIRECTOR");
            } else if (state === "failed") {
              setSignalStatus("WEBRTC FAILED");
            } else if (state === "disconnected") {
              setSignalStatus("WEBRTC DISCONNECTED");
            }
          }
        });

        peers.current[from] = peer;

        media.getTracks().forEach(track => {
          peer.addTrack(track, media);
        });

        try {
          await peer.setRemoteDescription(offer);
          await flushIce(from);

          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);

          socket.emit("webrtc:answer", {
            target: from,
            answer: peer.localDescription
          });

          setSignalStatus("ANSWER SENT");
        } catch (error) {
          console.error("Camera offer error", error);
          setSignalStatus("ANSWER FAILED");
        }
      };

      const handleIce = async ({ from, candidate }) => {
        if (!candidate) return;

        const peer = peers.current[from];

        if (!peer || !peer.remoteDescription) {
          queueIce(from, candidate);
          return;
        }

        try {
          await peer.addIceCandidate(candidate);
        } catch (error) {
          console.error("Camera ICE error", error);
        }
      };

      const handleRegistered = ({ slotId, directorAvailable }) => {
        setAssignedSlot(slotId);

        setSignalStatus(
          directorAvailable
            ? `CAM ${String(slotId).padStart(2, "0")} REGISTERED`
            : `CAM ${String(slotId).padStart(2, "0")} WAITING FOR DIRECTOR`
        );
      };

      const handleConnect = () => {
        setSignalStatus("SIGNAL CONNECTED");

        socket.emit("camera:join", {
          room: roomCode,
          name: cameraName.trim() || "WIRELESS CAMERA",
          slotId: assignedSlot
        });
      };

      const handleDisconnect = () => {
        setSignalStatus("SIGNAL DISCONNECTED");
      };

      socket.off("connect");
      socket.off("disconnect");
      socket.off("webrtc:offer");
      socket.off("webrtc:ice");
      socket.off("camera:registered");

      socket.on("connect", handleConnect);
      socket.on("disconnect", handleDisconnect);
      socket.on("webrtc:offer", handleOffer);
      socket.on("webrtc:ice", handleIce);
      socket.on("camera:registered", handleRegistered);

      socket.setRoom(roomCode);
      socket.connect();
    } catch (error) {
      setSignalStatus("CAMERA ACCESS FAILED");
      alert(`Camera access failed: ${error.message}`);
    }
  }

  function stopCamera() {
    stream?.getTracks().forEach(track => track.stop());

    Object.values(peers.current).forEach(peer => peer.close());
    peers.current = {};
    pendingIce.current = {};

    socket.off("connect");
    socket.off("disconnect");
    socket.off("webrtc:offer");
    socket.off("webrtc:ice");
    socket.off("camera:registered");
    socket.disconnect();

    setStream(null);
    setZoomRange(null);
    setZoomValue(1);
    setSignalStatus("OFFLINE");
  }

  function take() {
    if (!preview || preview === program) return;
    const oldProgram = program;
    setProgram(preview);
    setPreview(oldProgram);
  }

  function cut() {
    setTransition("CUT");
    take();
  }

  if (showCamera) {
    return (
      <div className="operator-shell">
        <header className="operator-header">
          <div>
            <span className="eyebrow">SCENEPILOT CAMERA</span>
            <h1>Camera Operator</h1>
          </div>
          <span className="room-pill">ROOM {roomCode}</span>
        </header>

        <main className="operator-main">
          <div className="phone-monitor">
            {stream ? (
              <video ref={cameraVideo} autoPlay muted playsInline />
            ) : (
              <div className="camera-placeholder">
                <Camera size={52} />
                <strong>Camera not connected</strong>
                <span>Enable your camera to join the production.</span>
              </div>
            )}

            {stream && (
              <>
                <span className="operator-live"><i /> CONNECTED</span>

                <div className="camera-live-controls">
                  <button
                    type="button"
                    onClick={flipCamera}
                    title="Switch front / rear camera"
                  >
                    <RefreshCw size={19}/>
                    <span>FLIP</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => changeZoom(-1)}
                    disabled={!zoomRange || zoomValue <= zoomRange.min}
                    title={zoomRange ? "Zoom out" : "Zoom unavailable on this device"}
                  >
                    <ZoomOut size={19}/>
                  </button>

                  <span className="zoom-readout">
                    {zoomRange ? `${zoomValue.toFixed(1)}×` : "ZOOM N/A"}
                  </span>

                  <button
                    type="button"
                    onClick={() => changeZoom(1)}
                    disabled={!zoomRange || zoomValue >= zoomRange.max}
                    title={zoomRange ? "Zoom in" : "Zoom unavailable on this device"}
                  >
                    <ZoomIn size={19}/>
                  </button>
                </div>

                <div className="operator-overlay">
                  <span>CAMERA {String(assignedSlot).padStart(2, "0")}</span>
                  <span>{qualityProfiles[qualityProfile].label}</span>
                  <span>{qualityProfiles[qualityProfile].fps} FPS</span>
                </div>
              </>
            )}
          </div>

          <section className="operator-card">
            <label>CAMERA NAME</label>
            <input
              value={cameraName}
              onChange={event => setCameraName(event.target.value)}
            />
            {!stream && (
              <>
                <div className="source-row">
                  <label>CAMERA SOURCE</label>
                  <div className="source-select-line">
                    <select
                      value={selectedVideoDevice}
                      onChange={event => setSelectedVideoDevice(event.target.value)}
                    >
                      <option value="">AUTO / PHONE CAMERA</option>
                      {videoInputs.map((device, index) => (
                        <option key={device.deviceId || index} value={device.deviceId}>
                          {device.label || `CAMERA SOURCE ${index + 1}`}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={refreshVideoInputs}>
                      REFRESH
                    </button>
                  </div>
                  <small>
                    HDMI capture cards and USB cameras appear here when the browser can see them.
                  </small>
                </div>

                <div className="quality-row">
                  <label>VIDEO QUALITY</label>
                <select
                  value={qualityProfile}
                  onChange={event => setQualityProfile(event.target.value)}
                >
                  <option value="1080p">1080P / 30 FPS</option>
                  <option value="720p">720P / 30 FPS</option>
                  <option value="auto">AUTO / BANDWIDTH FRIENDLY</option>
                </select>
                </div>
              </>
            )}

            <div className="operator-status">
              <span><Wifi size={17}/> {signalStatus}</span>
              <span><BatteryFull size={17}/> Battery</span>
              <span><Mic2 size={17}/> Audio</span>
            </div>

            {!stream ? (
              <button className="enable-camera" onClick={enableCamera}>
                <Video size={20}/> ENABLE CAMERA + MICROPHONE
              </button>
            ) : (
              <button className="disconnect-camera" onClick={stopCamera}>
                DISCONNECT CAMERA
              </button>
            )}
          </section>

          <button className="return-director tips-trigger" onClick={() => setShowTips(true)}>
            <CircleHelp size={17}/> TIPS / HELP
          </button>

          <button className="return-director" onClick={() => {
            stopCamera();
            setShowCamera(false);
            history.replaceState({}, "", window.location.pathname);
          }}>
            Return to Director
          </button>
        </main>

        {showTips && (
          <div className="modal-backdrop" onClick={() => setShowTips(false)}>
            <div className="join-modal tips-modal" onClick={e => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setShowTips(false)}><X/></button>
              <div className="join-icon"><CircleHelp size={29}/></div>
              <span className="eyebrow">SCENEPILOT CAMERA HELP</span>
              <h2>Camera operator tips</h2>
              <div className="tips-list">
                <p><strong>1.</strong> Enter a camera name before connecting.</p>
                <p><strong>2.</strong> Camera Source can use the phone camera, a USB webcam, or an HDMI capture device recognized by the browser.</p>
                <p><strong>3.</strong> Start with 1080P. Use 720P or Auto if bandwidth gets tight.</p>
                <p><strong>4.</strong> Tap Enable Camera + Microphone and allow browser permissions.</p>
                <p><strong>5.</strong> ScenePilot assigns the next available camera slot automatically.</p>
                <p><strong>6.</strong> LIVE TO DIRECTOR means the WebRTC media connection is active.</p>
                <p><strong>7.</strong> Use FLIP to switch between the rear and front camera without leaving the production.</p>
                <p><strong>8.</strong> Zoom controls use the phone camera's hardware zoom when the browser supports it.</p>
                <p><strong>9.</strong> If the connection drops, leave the page open while ScenePilot reconnects.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const programCam = cameras.find(c => c.id === program);
  const previewCam = cameras.find(c => c.id === preview);

  const cameraForSlot = slotId =>
    wirelessCameras.find(camera => camera.slotId === slotId);

  const streamForSlot = slotId => {
    const camera = cameraForSlot(slotId);
    return camera ? remoteStreams[camera.socketId] : null;
  };

  return (
    <div className="console">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><Radio size={25}/></div>
          <div>
            <h1>SCENEPILOT</h1>
            <span>LIVE PRODUCTION CONSOLE</span>
          </div>
        </div>

        <div className="production-title">
          <span>PRODUCTION</span>
          <strong>GO-GO LIVE • MAIN STAGE</strong>
        </div>

        <div className="top-actions">
          <span className="network"><i/> {signalStatus}</span>
          <button onClick={() => setShowJoin(true)}><Users size={18}/> ADD CAMERA</button>
          <button onClick={() => setShowTips(true)}><CircleHelp size={18}/> TIPS</button>
          <button className="icon-button"><Settings size={19}/></button>
        </div>
      </header>

      <main className="workspace">
        <section className="monitor-section">
          <div className="monitor preview-monitor">
            <div className="monitor-head">
              <span>PREVIEW</span>
              <strong>PVW</strong>
            </div>
            <div className="screen">
              {streamForSlot(preview) ? (
                <video
                  autoPlay
                  playsInline
                  muted
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover"
                  }}
                  ref={el => {
                    const liveStream = streamForSlot(preview);

                    if (
                      el &&
                      liveStream &&
                      el.srcObject !== liveStream
                    ) {
                      el.srcObject = liveStream;
                      el.play?.().catch(() => {});
                    }
                  }}
                />
              ) : (
                <div className="fake-feed preview-feed">
                  <Camera size={54}/>
                  <strong>CAM {String(preview).padStart(2,"0")}</strong>
                  <span>{previewCam?.name}</span>
                </div>
              )}
              <span className="source-tag">CAM {preview}</span>
              <button className="fullscreen"><Maximize2 size={17}/></button>
            </div>
          </div>

          <div className="monitor program-monitor">
            <div className="monitor-head">
              <span>PROGRAM</span>
              <strong>PGM</strong>
            </div>
            <div className="screen">
              {streamForSlot(program) ? (
                <video
                  autoPlay
                  playsInline
                  muted
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover"
                  }}
                  ref={el => {
                    const liveStream = streamForSlot(program);

                    if (
                      el &&
                      liveStream &&
                      el.srcObject !== liveStream
                    ) {
                      el.srcObject = liveStream;
                      el.play?.().catch(() => {});
                    }
                  }}
                />
              ) : (
                <div className="fake-feed program-feed">
                  <Camera size={54}/>
                  <strong>CAM {String(program).padStart(2,"0")}</strong>
                  <span>{programCam?.name}</span>
                </div>
              )}
              <span className="live-badge"><i/> LIVE</span>
              <span className="source-tag">CAM {program}</span>
              <button className="fullscreen"><Maximize2 size={17}/></button>
            </div>
          </div>
        </section>

        <section className="camera-bank">
          <div className="section-title">
            <div><span>SOURCES</span><strong>CAMERA MULTIVIEW</strong></div>
            <span>{
              cameras.filter(c =>
                c.status !== "OFFLINE" ||
                Boolean(cameraForSlot(c.id))
              ).length
            } / 9 CONNECTED</span>
          </div>

          <div className="camera-grid">
            {cameras.map(cam => (
              <button
                key={cam.id}
                disabled={
                  cam.status === "OFFLINE" &&
                  !cameraForSlot(cam.id)
                }
                onClick={() => setPreview(cam.id)}
                className={`camera-tile
                  ${cam.id === program ? "is-program" : ""}
                  ${cam.id === preview ? "is-preview" : ""}
                  ${cam.status === "OFFLINE" && !cameraForSlot(cam.id) ? "offline" : ""}`}
              >
                <div className="tile-feed">
                  {streamForSlot(cam.id) ? (
                    <video
                      autoPlay
                      playsInline
                      muted
                      ref={el => {
                        const liveStream = streamForSlot(cam.id);

                        if (
                          el &&
                          liveStream &&
                          el.srcObject !== liveStream
                        ) {
                          el.srcObject = liveStream;
                          el.play?.().catch(() => {});
                        }
                      }}
                    />
                  ) : (
                    <>
                      <Camera size={27}/>
                      <span>CAM {String(cam.id).padStart(2,"0")}</span>
                    </>
                  )}
                </div>

                <div className="tile-meta">
                  <strong>{cameraForSlot(cam.id)?.name || cam.name}</strong>
                  <div>
                    <span><Wifi size={12}/>{cam.signal || "—"}</span>
                    <span><BatteryFull size={13}/>{cam.battery || "—"}%</span>
                  </div>
                </div>

                {cam.id === program && <span className="bus-label pgm">PGM</span>}
                {cam.id === preview && <span className="bus-label pvw">PVW</span>}
              </button>
            ))}
          </div>
        </section>

        <section className="control-deck">
          <div className="transition-panel">
            <div className="panel-label">TRANSITION</div>
            <div className="transition-types">
              {["CUT","DISSOLVE","FADE"].map(type => (
                <button
                  key={type}
                  onClick={() => setTransition(type)}
                  className={transition === type ? "active" : ""}
                >
                  {type}
                </button>
              ))}
            </div>

            <div className="duration">
              <span>DURATION</span>
              {[250,500,1000].map(ms => (
                <button
                  key={ms}
                  className={duration === ms ? "active" : ""}
                  onClick={() => setDuration(ms)}
                >
                  {ms === 1000 ? "1.0s" : `${ms/1000}s`}
                </button>
              ))}
            </div>

            <button className="take-button" onClick={transition === "CUT" ? cut : take}>
              <span>TAKE</span>
              <small>{transition} • {duration}ms</small>
            </button>
          </div>

          <div className="audio-panel">
            <div className="panel-label">MASTER AUDIO</div>
            <div className="audio-source">
              <Mic2 size={19}/>
              <div><span>SOURCE</span><strong>M-AUDIO AIR</strong></div>
              <span className="locked">MASTER</span>
            </div>
            <div className="meters">
              <div className="meter-label">L</div><div className="meter"><i style={{width:"78%"}}/></div>
              <div className="meter-label">R</div><div className="meter"><i style={{width:"71%"}}/></div>
            </div>
            <div className="audio-footer">
              <span><Volume2 size={15}/> -6.2 dB</span>
              <span>48 kHz</span>
            </div>
          </div>

          <div className="production-tools">
            <div className="panel-label">PRODUCTION</div>
            <div className="tool-grid">
              <button><Type size={19}/><span>LOWER THIRD</span></button>
              <button><Layers size={19}/><span>GRAPHICS</span></button>
              <button><PictureInPicture2 size={19}/><span>PiP</span></button>
              <button><MonitorUp size={19}/><span>MEDIA</span></button>
            </div>
          </div>

          <div className="record-panel">
            <div className="panel-label">OUTPUT</div>
            <button
              className={`record-button ${recording ? "recording" : ""}`}
              onClick={() => setRecording(!recording)}
            >
              <Circle size={19} fill="currentColor"/>
              {recording ? "STOP RECORDING" : "RECORD"}
            </button>
            <div className="output-data">
              <span>1080p30</span><span>REC • LOCAL</span>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <span>SCENEPILOT ENGINE</span>
        <span><i/> SYSTEM READY</span>
        <span>ROOM {roomCode}</span>
        <span>00:00:00</span>
      </footer>

      {showTips && (
        <div className="modal-backdrop" onClick={() => setShowTips(false)}>
          <div className="join-modal tips-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowTips(false)}><X/></button>
            <div className="join-icon"><CircleHelp size={29}/></div>
            <span className="eyebrow">SCENEPILOT QUICK TIPS</span>
            <h2>Run the production</h2>
            <div className="tips-list">
              <p><strong>Add cameras:</strong> Tap Add Camera and let each phone scan the QR code.</p>
              <p><strong>Automatic slots:</strong> Phones fill CAM 07, 08, 09, then the remaining open slots.</p>
              <p><strong>Preview:</strong> Tap a camera tile to place it in Preview.</p>
              <p><strong>Program:</strong> Tap Take or Cut to move Preview to Program.</p>
              <p><strong>VIDEO CONNECTED:</strong> The director is receiving a real WebRTC media stream.</p>
              <p><strong>ANSWER RECEIVED:</strong> Signaling worked; the peer connection is still finishing.</p>
              <p><strong>Bandwidth:</strong> 1080P looks best. Move some phones to 720P/Auto if several feeds become unstable.</p>
              <p><strong>Reconnect:</strong> Keep the camera page open. ScenePilot will attempt to reconnect signaling automatically.</p>
            </div>
          </div>
        </div>
      )}

      {showJoin && (
        <div className="modal-backdrop" onClick={() => setShowJoin(false)}>
          <div className="join-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowJoin(false)}><X/></button>
            <div className="join-icon"><Smartphone size={29}/></div>
            <span className="eyebrow">ADD WIRELESS CAMERA</span>
            <h2>Join this production</h2>
            <p>Connect the phone to the production Wi-Fi, then scan this code.</p>
            <div className="qr-wrap"><QRCodeSVG value={joinUrl} size={190}/></div>
            <div className="room-code"><span>ROOM CODE</span><strong>{roomCode}</strong></div>
            <button className="camera-demo" onClick={() => {
              setShowJoin(false);
              setShowCamera(true);
            }}>
              OPEN CAMERA MODE ON THIS DEVICE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
