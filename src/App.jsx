import { useEffect, useRef, useState } from "react";
import {
  Radio, Circle, Mic2, Volume2, Wifi, BatteryFull,
  Settings, Maximize2, MonitorUp, Users, QrCode,
  Type, Layers, PictureInPicture2, Video, Camera,
  Smartphone, X, CircleHelp, RefreshCw, ZoomIn, ZoomOut, PhoneOff, ShieldCheck,
  Scissors, Play, Save, Download, SkipBack, Film, Upload
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import "./App.css";
import { socket } from "./socket";
import { createPeerConnection } from "./webrtc";
import ReplayStudio from "./ReplayStudio";
import BroadcastPanel from "./BroadcastPanel";

const qualityProfiles = {
  "1080p": { width: 1920, height: 1080, fps: 30, label: "1080P" },
  "720p": { width: 1280, height: 720, fps: 30, label: "720P" },
  "auto": { width: 1280, height: 720, fps: 30, label: "AUTO" }
};

function ScenePilotSplash({ cameraMode }) {
  return (
    <div className="scenepilot-splash" role="status" aria-label="ScenePilot loading">
      <div className="splash-orbit splash-orbit-one"/>
      <div className="splash-orbit splash-orbit-two"/>
      <div className="splash-orbit splash-orbit-three"/>
      <div className="splash-core">
        <div className="splash-mark"><Radio size={34}/></div>
        <strong>SCENEPILOT</strong>
        <span>{cameraMode ? "CAMERA LINK" : "LIVE PRODUCTION CONSOLE"}</span>
        <div className="splash-line"><i/></div>
        <small>{cameraMode ? "CONNECTING CAMERA" : "LOADING CONTROL ROOM"}</small>
      </div>
    </div>
  );
}

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
  const [showSplash, setShowSplash] = useState(true);
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
  const [isOnAir, setIsOnAir] = useState(false);
  const [assignedSlot, setAssignedSlot] = useState(7);
  const assignedSlotRef = useRef(7);
  const [cameraName, setCameraName] = useState("ROAMING 1");
  const [qualityProfile, setQualityProfile] = useState("1080p");
  const [showTips, setShowTips] = useState(false);
  const [showCallShield, setShowCallShield] = useState(false);
  const [liveShieldEnabled, setLiveShieldEnabled] = useState(false);
  const wakeLock = useRef(null);
  const [facingMode, setFacingMode] = useState("environment");
  const [zoomRange, setZoomRange] = useState(null);
  const [zoomValue, setZoomValue] = useState(1);
  const [videoInputs, setVideoInputs] = useState([]);
  const [selectedVideoDevice, setSelectedVideoDevice] = useState("");
  const [showReplayEditor, setShowReplayEditor] = useState(true);
  const [compositionMode, setCompositionMode] = useState("single");
  const [secondaryPreview, setSecondaryPreview] = useState(8);
  const [programComposition, setProgramComposition] = useState({
    mode: "single",
    primary: 1,
    secondary: null
  });
  const [draggingCamera, setDraggingCamera] = useState(null);
  const [localClip, setLocalClip] = useState(null);
  const localClipUrl = useRef(null);
  const [instantReplayMode, setInstantReplayMode] = useState("live");
  const [instantReplayUrl, setInstantReplayUrl] = useState(null);
  const [instantReplaySeconds, setInstantReplaySeconds] = useState(10);
  const [instantReplayStatus, setInstantReplayStatus] = useState("BUFFER WAITING");
  const replayRecorderRef = useRef(null);
  const replayChunksRef = useRef([]);
  const instantReplayVideoRef = useRef(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowSplash(false), 1650);
    return () => window.clearTimeout(timer);
  }, []);

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

  useEffect(() => {
    return () => {
      if (localClipUrl.current) {
        URL.revokeObjectURL(localClipUrl.current);
      }
      if (instantReplayUrl) {
        URL.revokeObjectURL(instantReplayUrl);
      }
      try {
        replayRecorderRef.current?.stop?.();
      } catch (_) {}
    };
  }, [instantReplayUrl]);

  useEffect(() => {
    if (showCamera || !socket.connected) return;

    const liveSlots = programComposition.mode === "single"
      ? [programComposition.primary]
      : [programComposition.primary, programComposition.secondary].filter(Boolean);

    socket.emit("program:update", {
      room: roomCode,
      liveSlots
    });
  }, [showCamera, roomCode, programComposition]);

  useEffect(() => {
    if (showCamera) return;

    const primarySlot = programComposition.primary;
    const primaryCamera = wirelessCameras.find(camera => camera.slotId === primarySlot);
    const programStream = primaryCamera
      ? remoteStreams[primaryCamera.socketId]
      : null;

    if (!programStream || typeof MediaRecorder === "undefined") {
      setInstantReplayStatus("BUFFER WAITING");
      return;
    }

    try {
      if (replayRecorderRef.current?.state !== "inactive") {
        replayRecorderRef.current?.stop?.();
      }
    } catch (_) {}

    replayChunksRef.current = [];

    let mimeType = "";
    const candidates = [
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4"
    ];

    for (const candidate of candidates) {
      if (MediaRecorder.isTypeSupported?.(candidate)) {
        mimeType = candidate;
        break;
      }
    }

    let recorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(programStream, { mimeType })
        : new MediaRecorder(programStream);
    } catch (error) {
      console.error("ScenePilot replay recorder unavailable", error);
      setInstantReplayStatus("REPLAY UNSUPPORTED");
      return;
    }

    recorder.ondataavailable = event => {
      if (!event.data || !event.data.size) return;

      const now = Date.now();
      replayChunksRef.current.push({
        blob: event.data,
        time: now
      });

      const cutoff = now - 35000;
      replayChunksRef.current = replayChunksRef.current.filter(
        chunk => chunk.time >= cutoff
      );

      setInstantReplayStatus("BUFFERING 30S");
    };

    recorder.onerror = error => {
      console.error("ScenePilot instant replay recorder error", error);
      setInstantReplayStatus("REPLAY ERROR");
    };

    try {
      recorder.start(1000);
      replayRecorderRef.current = recorder;
      setInstantReplayStatus("BUFFERING 30S");
    } catch (error) {
      console.error("ScenePilot instant replay start failed", error);
      setInstantReplayStatus("REPLAY ERROR");
    }

    return () => {
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch (_) {}

      if (replayRecorderRef.current === recorder) {
        replayRecorderRef.current = null;
      }
    };
  }, [showCamera, programComposition.primary, wirelessCameras, remoteStreams]);

  function buildInstantReplay(seconds) {
    const cutoff = Date.now() - seconds * 1000;
    const parts = replayChunksRef.current
      .filter(chunk => chunk.time >= cutoff)
      .map(chunk => chunk.blob);

    if (!parts.length) {
      setInstantReplayStatus("BUFFER NOT READY");
      return;
    }

    if (instantReplayUrl) {
      URL.revokeObjectURL(instantReplayUrl);
    }

    const type = parts[0]?.type || "video/webm";
    const blob = new Blob(parts, { type });
    const url = URL.createObjectURL(blob);

    setInstantReplaySeconds(seconds);
    setInstantReplayUrl(url);
    setInstantReplayMode("preview");
    setInstantReplayStatus(`REPLAY ${seconds}S READY`);
  }

  function playInstantReplay() {
    if (!instantReplayUrl) return;

    setInstantReplayMode("program");
    requestAnimationFrame(() => {
      const video = instantReplayVideoRef.current;
      if (video) {
        video.currentTime = 0;
        video.play?.().catch(() => {});
      }
    });
  }

  function returnToLive() {
    setInstantReplayMode("live");
    setInstantReplayStatus("BUFFERING 30S");
  }

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

  async function enableLiveShield() {
    setLiveShieldEnabled(true);

    try {
      if ("wakeLock" in navigator) {
        wakeLock.current = await navigator.wakeLock.request("screen");
      }
    } catch (error) {
      console.warn("ScenePilot wake lock unavailable", error);
    }

    setShowCallShield(true);
  }

  async function disableLiveShield() {
    setLiveShieldEnabled(false);

    try {
      await wakeLock.current?.release?.();
    } catch (error) {
      console.warn("ScenePilot wake lock release failed", error);
    }

    wakeLock.current = null;
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
        if (slotId) {
          assignedSlotRef.current = Number(slotId);
          setAssignedSlot(Number(slotId));
        }

        setSignalStatus(
          directorAvailable
            ? `CAM ${String(slotId || assignedSlot).padStart(2, "0")} CONNECTED / READY`
            : `CAM ${String(slotId || assignedSlot).padStart(2, "0")} WAITING FOR DIRECTOR`
        );
      };

      const handleProgramStatus = ({ liveSlots = [] }) => {
        setIsOnAir(
          liveSlots.map(Number).includes(Number(assignedSlotRef.current))
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
      socket.off("program:status");

      socket.on("connect", handleConnect);
      socket.on("disconnect", handleDisconnect);
      socket.on("webrtc:offer", handleOffer);
      socket.on("webrtc:ice", handleIce);
      socket.on("camera:registered", handleRegistered);
      socket.on("program:status", handleProgramStatus);

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
    socket.off("program:status");
    socket.disconnect();

    setStream(null);
    setIsOnAir(false);
    setZoomRange(null);
    setZoomValue(1);
    setSignalStatus("OFFLINE");
    disableLiveShield();
  }

  function take() {
    if (!preview) return;

    if (compositionMode === "single") {
      if (preview === program && programComposition.mode === "single") return;

      const oldProgram = program;
      setProgram(preview);
      setPreview(oldProgram);
      setProgramComposition({
        mode: "single",
        primary: preview,
        secondary: null
      });
      return;
    }

    setProgram(preview);
    setProgramComposition({
      mode: compositionMode,
      primary: preview,
      secondary: secondaryPreview
    });
  }

  function cut() {
    setTransition("CUT");
    take();
  }

  function loadLocalClip(file) {
    if (!file) return;

    if (localClipUrl.current) {
      URL.revokeObjectURL(localClipUrl.current);
    }

    const url = URL.createObjectURL(file);
    localClipUrl.current = url;

    setLocalClip({
      name: file.name,
      size: file.size,
      type: file.type,
      url
    });

    setShowReplayEditor(true);
  }

  function dropCameraOnPreview(slotId) {
    if (!slotId) return;

    if (compositionMode === "single") {
      setPreview(slotId);
      return;
    }

    if (preview === slotId) {
      return;
    }

    setSecondaryPreview(slotId);
  }

  if (showSplash) {
    return <ScenePilotSplash cameraMode={showCamera} />;
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
                <span className={`operator-live ${isOnAir ? "on-air" : "ready"}`}>
                  <i /> {isOnAir ? "YOU ARE LIVE" : "CONNECTED / READY"}
                </span>

                <div className={`on-air-banner ${isOnAir ? "live" : "standby"}`}>
                  {isOnAir ? (
                    <>
                      <Radio size={22}/>
                      <div>
                        <strong>YOU ARE ON AIR</strong>
                        <span>CAMERA {String(assignedSlot).padStart(2, "0")} IS LIVE</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <Camera size={22}/>
                      <div>
                        <strong>CONNECTED — STANDBY</strong>
                        <span>Camera feed is ready for the director.</span>
                      </div>
                    </>
                  )}
                </div>

                <div className="camera-live-controls">
                  <button
                    type="button"
                    className="camera-control-button"
                    onClick={() => changeZoom(-1)}
                    disabled={!zoomRange || zoomValue <= zoomRange.min}
                    title={zoomRange ? "Zoom out" : "Optical zoom is unavailable on this camera"}
                  >
                    <ZoomOut size={24}/>
                    <span>ZOOM OUT</span>
                  </button>

                  <span className="zoom-readout">
                    {zoomRange ? `${zoomValue.toFixed(1)}×` : "1.0×"}
                  </span>

                  <button
                    type="button"
                    className="camera-control-button"
                    onClick={() => changeZoom(1)}
                    disabled={!zoomRange || zoomValue >= zoomRange.max}
                    title={zoomRange ? "Zoom in" : "Optical zoom is unavailable on this camera"}
                  >
                    <ZoomIn size={24}/>
                    <span>ZOOM IN</span>
                  </button>

                  <button
                    type="button"
                    className="camera-control-button flip-control"
                    onClick={flipCamera}
                    title="Switch front / rear camera"
                  >
                    <RefreshCw size={24}/>
                    <span>SWITCH CAMERA</span>
                  </button>

                  <button
                    type="button"
                    className={`camera-control-button shield-control ${liveShieldEnabled ? "active" : ""}`}
                    onClick={liveShieldEnabled ? disableLiveShield : enableLiveShield}
                    title="Protect the live camera session from interruptions"
                  >
                    {liveShieldEnabled ? <ShieldCheck size={24}/> : <PhoneOff size={24}/>}
                    <span>{liveShieldEnabled ? "LIVE SHIELD ON" : "LIVE SHIELD"}</span>
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
              <span><Wifi size={17}/> {isOnAir ? "ON AIR" : signalStatus}</span>
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

        {showCallShield && (
          <div className="modal-backdrop" onClick={() => setShowCallShield(false)}>
            <div className="join-modal call-shield-modal" onClick={e => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setShowCallShield(false)}><X/></button>
              <div className="join-icon"><PhoneOff size={29}/></div>
              <span className="eyebrow">SCENEPILOT LIVE SHIELD</span>
              <h2>Protect this camera phone</h2>
              <p>
                ScenePilot will keep the screen awake while Live Shield is on. Your browser cannot
                turn off cellular calls by itself, so enable the phone's Focus / Do Not Disturb mode
                before going live.
              </p>
              <div className="call-shield-steps">
                <strong>iPHONE</strong>
                <span>Open Control Center → Focus → Do Not Disturb.</span>
                <span>For the cleanest live session, silence people/apps and disable repeated-call bypass.</span>
                <strong>ANDROID</strong>
                <span>Open Quick Settings → Do Not Disturb.</span>
                <span>Set calls, messages and app interruptions to none for the production.</span>
              </div>
              <button className="camera-demo" onClick={() => setShowCallShield(false)}>
                DONE — RETURN TO CAMERA
              </button>
            </div>
          </div>
        )}

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

  const renderSource = (slotId, variant = "preview") => {
    const liveStream = streamForSlot(slotId);
    const fallbackCamera = cameras.find(camera => camera.id === slotId);
    const liveCamera = cameraForSlot(slotId);

    if (liveStream) {
      return (
        <video
          autoPlay
          playsInline
          muted
          className="composition-video"
          ref={el => {
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
      );
    }

    return (
      <div className={`fake-feed ${variant === "program" ? "program-feed" : "preview-feed"}`}>
        <Camera size={44}/>
        <strong>CAM {String(slotId).padStart(2,"0")}</strong>
        <span>{liveCamera?.name || fallbackCamera?.name || "SOURCE"}</span>
      </div>
    );
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
            <div
              className={`screen preview-drop-zone ${draggingCamera ? "drag-active" : ""}`}
              onDragOver={event => event.preventDefault()}
              onDrop={event => {
                event.preventDefault();
                const slotId = Number(
                  event.dataTransfer.getData("text/scenepilot-camera") ||
                  draggingCamera
                );
                dropCameraOnPreview(slotId);
                setDraggingCamera(null);
              }}
            >
              {instantReplayMode === "preview" && instantReplayUrl ? (
                <video
                  src={instantReplayUrl}
                  className="composition-video instant-replay-video"
                  controls
                  playsInline
                  preload="auto"
                />
              ) : compositionMode === "split" ? (
                <div className="composition split-composition">
                  <div className="composition-pane">
                    {renderSource(preview, "preview")}
                    <span className="composition-label">CAM {preview}</span>
                  </div>
                  <div className="composition-pane">
                    {renderSource(secondaryPreview, "preview")}
                    <span className="composition-label">CAM {secondaryPreview}</span>
                  </div>
                </div>
              ) : compositionMode === "pip" ? (
                <div className="composition pip-composition">
                  <div className="pip-main">
                    {renderSource(preview, "preview")}
                  </div>
                  <div className="pip-window">
                    {renderSource(secondaryPreview, "preview")}
                    <span className="composition-label">CAM {secondaryPreview}</span>
                  </div>
                </div>
              ) : (
                renderSource(preview, "preview")
              )}
              <span className="source-tag">
                {instantReplayMode === "preview"
                  ? `REPLAY ${instantReplaySeconds}S`
                  : compositionMode === "single"
                    ? `CAM ${preview}`
                    : `${compositionMode.toUpperCase()} • CAM ${preview} + CAM ${secondaryPreview}`}
              </span>
              <button className="fullscreen"><Maximize2 size={17}/></button>
            </div>
          </div>

          <div className="monitor program-monitor">
            <div className="monitor-head">
              <span>PROGRAM</span>
              <strong>PGM</strong>
            </div>
            <div className="screen">
              {instantReplayMode === "program" && instantReplayUrl ? (
                <video
                  ref={instantReplayVideoRef}
                  src={instantReplayUrl}
                  className="composition-video instant-replay-video"
                  autoPlay
                  playsInline
                  onEnded={returnToLive}
                />
              ) : programComposition.mode === "split" ? (
                <div className="composition split-composition">
                  <div className="composition-pane">
                    {renderSource(programComposition.primary, "program")}
                    <span className="composition-label">CAM {programComposition.primary}</span>
                  </div>
                  <div className="composition-pane">
                    {renderSource(programComposition.secondary, "program")}
                    <span className="composition-label">CAM {programComposition.secondary}</span>
                  </div>
                </div>
              ) : programComposition.mode === "pip" ? (
                <div className="composition pip-composition">
                  <div className="pip-main">
                    {renderSource(programComposition.primary, "program")}
                  </div>
                  <div className="pip-window">
                    {renderSource(programComposition.secondary, "program")}
                    <span className="composition-label">CAM {programComposition.secondary}</span>
                  </div>
                </div>
              ) : (
                renderSource(programComposition.primary, "program")
              )}
              <span className="live-badge"><i/> LIVE</span>
              <span className="source-tag">
                {instantReplayMode === "program"
                  ? `INSTANT REPLAY ${instantReplaySeconds}S`
                  : programComposition.mode === "single"
                    ? `CAM ${programComposition.primary}`
                    : `${programComposition.mode.toUpperCase()} • CAM ${programComposition.primary} + CAM ${programComposition.secondary}`}
              </span>
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
                draggable={Boolean(cameraForSlot(cam.id))}
                onDragStart={event => {
                  if (!cameraForSlot(cam.id)) return;
                  setDraggingCamera(cam.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData(
                    "text/scenepilot-camera",
                    String(cam.id)
                  );
                }}
                onDragEnd={() => setDraggingCamera(null)}
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
                  {cameraForSlot(cam.id) && (
                    <span className="drag-hint">DRAG TO PREVIEW</span>
                  )}
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
            <div className="panel-label">LIVE LAYOUT</div>

            <div className="layout-mode-grid">
              <button
                className={compositionMode === "single" ? "active" : ""}
                onClick={() => setCompositionMode("single")}
              >
                <MonitorUp size={18}/><span>SINGLE</span>
              </button>

              <button
                className={compositionMode === "split" ? "active" : ""}
                onClick={() => setCompositionMode("split")}
              >
                <Layers size={18}/><span>SPLIT</span>
              </button>

              <button
                className={compositionMode === "pip" ? "active" : ""}
                onClick={() => setCompositionMode("pip")}
              >
                <PictureInPicture2 size={18}/><span>PiP</span>
              </button>
            </div>

            {compositionMode !== "single" && (
              <div className="secondary-source-picker">
                <label>SECOND CAMERA</label>
                <select
                  value={secondaryPreview}
                  onChange={event => setSecondaryPreview(Number(event.target.value))}
                >
                  {cameras.map(camera => (
                    <option key={camera.id} value={camera.id}>
                      CAM {String(camera.id).padStart(2,"0")} • {cameraForSlot(camera.id)?.name || camera.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
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

          <div className="instant-replay-panel">
            <div className="panel-label">INSTANT REPLAY</div>

            <div className="instant-replay-status">
              <i/>
              <span>{instantReplayStatus}</span>
            </div>

            <div className="instant-replay-presets">
              {[10,20,30].map(seconds => (
                <button
                  key={seconds}
                  onClick={() => buildInstantReplay(seconds)}
                >
                  REPLAY {seconds}s
                </button>
              ))}
            </div>

            <div className="instant-replay-actions">
              <button
                className="replay-live-button"
                onClick={playInstantReplay}
                disabled={!instantReplayUrl}
              >
                <Play size={16}/> PLAY REPLAY
              </button>

              <button
                onClick={returnToLive}
                disabled={instantReplayMode === "live"}
              >
                RETURN LIVE
              </button>
            </div>
          </div>
        </section>

        <BroadcastPanel />
        <ReplayStudio roomCode={roomCode} />
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
              <p><strong>1. Add cameras:</strong> Tap Add Camera and let each phone scan the QR code. Each connected phone gets its own camera slot.</p>
              <p><strong>2. Left screen = Preview:</strong> Tap any camera tile to load that camera onto the LEFT monitor first. Preview lets you check the shot before viewers see it.</p>
              <p><strong>3. Right screen = Program / Live:</strong> The RIGHT monitor is the camera or layout currently going out live.</p>
              <p><strong>4. TAKE:</strong> After choosing a camera in Preview, tap TAKE to move it to Program. The new camera becomes live on the right monitor.</p>
              <p><strong>5. CUT:</strong> CUT does the same switch immediately with no dissolve or fade.</p>
              <p><strong>6. Switch cameras:</strong> Tap another camera tile to preview it on the left, then tap TAKE or CUT when you are ready to put that camera live.</p>
              <p><strong>7. Camera phone status:</strong> CONNECTED / READY means the phone is available but not live. YOU ARE ON AIR means that phone is currently on Program.</p>
              <p><strong>8. Split Screen:</strong> Choose SPLIT, select the second camera, preview both on the left, then tap TAKE to put both cameras live together.</p>
              <p><strong>9. Picture-in-Picture:</strong> Choose PiP, select the smaller second camera, preview the layout, then tap TAKE.</p>
              <p><strong>10. Zoom / Switch camera:</strong> On each phone, use Zoom In, Zoom Out, and Switch Camera for front/rear camera control while connected.</p>
              <p><strong>11. Live Shield:</strong> Use Live Shield on the phone and enable the phone's Focus / Do Not Disturb mode before a production to reduce interruptions.</p>
              <p><strong>12. Bandwidth:</strong> Start with 1080P. If several phones become unstable, move some cameras to 720P or Auto.</p>
              <p><strong>13. Editor media:</strong> In Pro Editor + Replay Studio, use Import Media to load multiple local video, audio, or image files.</p>
              <p><strong>14. Timeline:</strong> Clips can live on multiple video, audio, and text tracks. Select a clip to change start, duration, speed, opacity, or volume.</p>
              <p><strong>15. Edit tools:</strong> Use Split at the playhead, Duplicate, Delete, Undo/Redo, timeline zoom, and Add Title while building the edit.</p>
              <p><strong>16. Instant Replay:</strong> While a live Program camera is running, ScenePilot keeps a rolling buffer. Tap Replay 10s, 20s, or 30s to load that moment into Preview, then Play Replay to put it on Program. It returns to live automatically when the clip ends.</p>
              <p><strong>17. Broadcast / Multistream:</strong> Select Facebook, Instagram, YouTube, Twitch, TikTok, Custom RTMP, ScenePilot Self-Hosted, or several at once. The panel is staged now; tomorrow the Debian encoder backend will make GO LIVE actually publish the Program feed.</p>
              <p><strong>18. Self-Hosted:</strong> ScenePilot Self-Hosted is your own destination. Your Debian server will receive the Program feed and can also serve a Watch Live page from your own system.</p>
              <p><strong>19. Server phase:</strong> Final rendered export, saved projects, permanent recordings, and the live FFmpeg broadcast engine will connect when ScenePilot moves onto the server.</p>
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
