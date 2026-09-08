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
import BroadcastGraphics from "./BroadcastGraphics";

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

const DIRECTOR_SOURCE = "director";

const initialCameras = Array.from({ length: 9 }, (_, index) => ({
  id: index + 1,
  name: `CAM ${String(index + 1).padStart(2, "0")}`,
  status: "OFFLINE",
  battery: 0,
  signal: 0
}));

function LiveStreamVideo({ stream, className = "", muted = true }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;

    if (!stream) {
      if (element.srcObject) element.srcObject = null;
      return;
    }

    if (element.srcObject !== stream) {
      element.srcObject = stream;
    }

    element.play?.().catch(() => {});

    return () => {
      if (element.srcObject === stream) {
        element.srcObject = null;
      }
    };
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={muted}
      className={className}
    />
  );
}

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
  const [directorLockMessage, setDirectorLockMessage] = useState("");
  const [isOnAir, setIsOnAir] = useState(false);
  const [assignedSlot, setAssignedSlot] = useState(7);
  const assignedSlotRef = useRef(7);
  const [cameraName, setCameraName] = useState("ROAMING 1");
  const [qualityProfile, setQualityProfile] = useState("1080p");
  const [showTips, setShowTips] = useState(false);
  const [showCallShield, setShowCallShield] = useState(false);
  const [liveShieldEnabled, setLiveShieldEnabled] = useState(false);
  const [telemetryAllowed, setTelemetryAllowed] = useState(false);
  const [cameraTelemetry, setCameraTelemetry] = useState({
    battery: null,
    charging: null,
    network: null,
    batterySupported: Boolean(navigator.getBattery),
    networkSupported: Boolean(
      navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection
    ),
    status: "NOT SHARED"
  });
  const wakeLock = useRef(null);
  const reconnectTimers = useRef({});
  const audioElements = useRef({});
  const [masterAudioSource, setMasterAudioSource] = useState("mix");
  const [cameraAudio, setCameraAudio] = useState({});
  const [cameraNames, setCameraNames] = useState({});
  const [showSetNames, setShowSetNames] = useState(false);
  const [draftCameraNames, setDraftCameraNames] = useState({});
  const [mainCamera, setMainCamera] = useState(1);
  const [directorStream, setDirectorStream] = useState(null);
  const [directorFacingMode, setDirectorFacingMode] = useState("user");
  const [directorCameraStatus, setDirectorCameraStatus] = useState("OFF");
  const [previewDirty, setPreviewDirty] = useState(false);
  const [programTransition, setProgramTransition] = useState({
    type: "CUT",
    duration: 0,
    key: 0
  });
  const [facingMode, setFacingMode] = useState("environment");
  const [zoomRange, setZoomRange] = useState(null);
  const [zoomValue, setZoomValue] = useState(1);
  const zoomValueRef = useRef(1);
  const zoomHoldTimer = useRef(null);
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

  useEffect(() => {
    return () => {
      directorStream?.getTracks?.().forEach(track => track.stop());
    };
  }, [directorStream]);

  useEffect(() => {
    if (!showCamera) return;

    const keepAwake = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        if ("wakeLock" in navigator && !wakeLock.current) {
          wakeLock.current = await navigator.wakeLock.request("screen");
        }
      } catch (error) {
        console.warn("ScenePilot camera wake lock unavailable", error);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && stream) {
        keepAwake();
      }
    };

    if (stream) keepAwake();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [showCamera, stream]);

  const queryParams = new URLSearchParams(window.location.search);
  const roomCode = queryParams.get("room") || "SP-4827";
  const cameraNetworkId = queryParams.get("network") || "";
  const cameraJoinToken = queryParams.get("join") || "";

  useEffect(() => {
    if (showCamera) return;

    try {
      const savedNames = JSON.parse(
        window.localStorage.getItem(`scenepilot:cameraNames:${roomCode}`) || "{}"
      );
      if (savedNames && typeof savedNames === "object") {
        setCameraNames(savedNames);
      }

      const savedMainRaw =
        window.localStorage.getItem(`scenepilot:mainCamera:${roomCode}`);

      if (savedMainRaw === DIRECTOR_SOURCE) {
        setMainCamera(DIRECTOR_SOURCE);
      } else {
        const savedMain = Number(savedMainRaw);
        if (savedMain >= 1 && savedMain <= 9) {
          setMainCamera(savedMain);
        }
      }
    } catch (error) {
      console.warn("ScenePilot saved camera setup unavailable", error);
    }
  }, [showCamera, roomCode]);

  const [network, setNetwork] = useState(() => (
    cameraNetworkId
      ? {
          id: cameraNetworkId,
          name: "ScenePilot Network",
          joinToken: cameraJoinToken
        }
      : null
  ));

  useEffect(() => {
    if (showCamera) return;

    let cancelled = false;

    fetch("/api/network", {
      credentials: "include",
      headers: { Accept: "application/json" }
    })
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || "Unable to load ScenePilot network.");
        }
        return data;
      })
      .then(data => {
        if (!cancelled) {
          setNetwork(data.network || null);
        }
      })
      .catch(error => {
        console.error("ScenePilot network load failed", error);
        if (!cancelled) {
          setSignalStatus("NETWORK ACCESS ERROR");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [showCamera]);

  const networkId = network?.id || cameraNetworkId;
  const joinUrl =
    network?.id && network?.joinToken
      ? `${window.location.origin}${window.location.pathname}?camera=1&network=${encodeURIComponent(network.id)}&room=${encodeURIComponent(roomCode)}&join=${encodeURIComponent(network.joinToken)}`
      : "";

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
    if (!showCamera || !stream || !socket.connected || !telemetryAllowed) return;

    let battery = null;
    let batteryCleanup = null;
    let interval = null;

    const connection =
      navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection;

    const batterySupported = Boolean(navigator.getBattery);
    const networkSupported = Boolean(connection);

    const getNetworkQuality = () => {
      if (!connection) return null;

      const downlink = Number(connection.downlink);
      const rtt = Number(connection.rtt);
      const effectiveType = String(connection.effectiveType || "");

      let bars = null;
      if (Number.isFinite(downlink) || Number.isFinite(rtt)) {
        if ((Number.isFinite(downlink) && downlink >= 10) && (!Number.isFinite(rtt) || rtt <= 80)) bars = 4;
        else if ((Number.isFinite(downlink) && downlink >= 3) && (!Number.isFinite(rtt) || rtt <= 180)) bars = 3;
        else if ((Number.isFinite(downlink) && downlink >= 1) && (!Number.isFinite(rtt) || rtt <= 350)) bars = 2;
        else bars = 1;
      }

      return {
        bars,
        downlink: Number.isFinite(downlink) ? downlink : null,
        rtt: Number.isFinite(rtt) ? rtt : null,
        effectiveType: effectiveType || null
      };
    };

    const sendTelemetry = () => {
      const batteryPercent =
        battery && Number.isFinite(battery.level)
          ? Math.round(battery.level * 100)
          : null;
      const network = getNetworkQuality();

      const nextTelemetry = {
        battery: batteryPercent,
        charging: battery ? Boolean(battery.charging) : null,
        network,
        batterySupported,
        networkSupported,
        status: "SHARING"
      };

      setCameraTelemetry(nextTelemetry);

      socket.emit("camera:telemetry", {
        room: roomCode,
        battery: batteryPercent,
        charging: battery ? Boolean(battery.charging) : null,
        network,
        telemetryConsent: true,
        support: {
          battery: batterySupported,
          network: networkSupported
        }
      });
    };

    if (navigator.getBattery) {
      navigator.getBattery()
        .then(value => {
          battery = value;
          sendTelemetry();

          const handleBattery = () => sendTelemetry();
          battery.addEventListener?.("levelchange", handleBattery);
          battery.addEventListener?.("chargingchange", handleBattery);
          batteryCleanup = () => {
            battery.removeEventListener?.("levelchange", handleBattery);
            battery.removeEventListener?.("chargingchange", handleBattery);
          };
        })
        .catch(() => {
          setCameraTelemetry(current => ({
            ...current,
            battery: null,
            batterySupported: false,
            status: "SHARING"
          }));
          sendTelemetry();
        });
    } else {
      sendTelemetry();
    }

    connection?.addEventListener?.("change", sendTelemetry);
    interval = window.setInterval(sendTelemetry, 15000);

    return () => {
      if (interval) window.clearInterval(interval);
      connection?.removeEventListener?.("change", sendTelemetry);
      batteryCleanup?.();
    };
  }, [showCamera, stream, roomCode, telemetryAllowed]);

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
    if (showCamera || !networkId) return;

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

    const schedulePeerRestart = (camera, delay = 3500) => {
      if (!camera?.socketId) return;
      clearTimeout(reconnectTimers.current[camera.socketId]);
      reconnectTimers.current[camera.socketId] = window.setTimeout(() => {
        const stillConnected = wirelessCameras.some(item => item.socketId === camera.socketId);
        if (stillConnected) startPeer(camera, true);
      }, delay);
    };

    const startPeer = async (camera, iceRestart = false) => {
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
            setPreviewDirty(true);
          }

          setSignalStatus("VIDEO CONNECTED");
        },

        onConnectionState: state => {
          if (state === "connecting") {
            setSignalStatus("WEBRTC CONNECTING");
          } else if (state === "connected") {
            setSignalStatus("PEER CONNECTED");
          } else if (state === "failed") {
            setSignalStatus("WEBRTC FAILED / RETRYING");
            schedulePeerRestart(camera, 2000);
          } else if (state === "disconnected") {
            setSignalStatus("WEBRTC DISCONNECTED / RETRYING");
            schedulePeerRestart(camera, 4000);
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
        const offer = await peer.createOffer(
          iceRestart ? { iceRestart: true } : undefined
        );

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

    const handleCameraTelemetry = payload => {
      if (!payload?.socketId) return;
      setWirelessCameras(prev =>
        prev.map(camera =>
          camera.socketId === payload.socketId
            ? {
                ...camera,
                battery: Number.isFinite(payload.battery) ? payload.battery : null,
                charging: payload.charging ?? null,
                network: payload.network || null,
                telemetryConsent: payload.telemetryConsent !== false,
                telemetrySupport: payload.support || camera.telemetrySupport || null
              }
            : camera
        )
      );
    };

    const handleCameraLeft = ({ socketId }) => {
      peers.current[socketId]?.close();
      delete peers.current[socketId];
      delete pendingIce.current[socketId];
      clearTimeout(reconnectTimers.current[socketId]);
      delete reconnectTimers.current[socketId];

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

    const handleDirectorGranted = () => {
      setDirectorLockMessage("");
      setSignalStatus("DIRECTOR ACTIVE");
    };

    const handleDirectorDenied = payload => {
      setDirectorLockMessage(
        payload?.message ||
        "This production already has an active Director."
      );
      setSignalStatus("DIRECTOR LOCKED");
    };

    const handleDirectorAvailable = () => {
      setDirectorLockMessage("");
      socket.emit("director:join", {
        room: roomCode
      });
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("room:cameras", handleRoomCameras);
    socket.on("camera:joined", handleCameraJoined);
    socket.on("webrtc:answer", handleAnswer);
    socket.on("webrtc:ice", handleIce);
    socket.on("camera:left", handleCameraLeft);
    socket.on("camera:telemetry", handleCameraTelemetry);
    socket.on("director:granted", handleDirectorGranted);
    socket.on("director:denied", handleDirectorDenied);
    socket.on("director:available", handleDirectorAvailable);

    socket.setNetwork(networkId);
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
      socket.off("camera:telemetry", handleCameraTelemetry);
      socket.off("director:granted", handleDirectorGranted);
      socket.off("director:denied", handleDirectorDenied);
      socket.off("director:available", handleDirectorAvailable);

      Object.values(peers.current).forEach(peer => peer.close());
      peers.current = {};
      pendingIce.current = {};
      Object.values(reconnectTimers.current).forEach(window.clearTimeout);
      reconnectTimers.current = {};

      socket.disconnect();
    };
  }, [showCamera, roomCode, networkId]);

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

    const liveSlots =
      programComposition.mode === "nine"
        ? cameras.map(camera => camera.id)
        : programComposition.mode === "single"
          ? [programComposition.primary]
          : [programComposition.primary, programComposition.secondary].filter(Boolean);

    const physicalLiveSlots = liveSlots
      .map(value => Number(value))
      .filter(value => Number.isInteger(value) && value >= 1 && value <= 9);

    socket.emit("program:update", {
      room: roomCode,
      liveSlots: physicalLiveSlots
    });
  }, [showCamera, roomCode, programComposition]);

  useEffect(() => {
    if (showCamera) return;

    const primarySlot = programComposition.primary;
    const primaryCamera = wirelessCameras.find(camera => camera.slotId === primarySlot);
    const programStream =
      primarySlot === DIRECTOR_SOURCE
        ? directorStream
        : primaryCamera
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
  }, [showCamera, programComposition.primary, wirelessCameras, remoteStreams, directorStream]);

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
      zoomValueRef.current = value;
      setZoomValue(value);
    } else {
      setZoomRange(null);
      zoomValueRef.current = 1;
      setZoomValue(1);
    }
  }

  async function changeZoom(direction, mediaStream = stream) {
    const videoTrack = mediaStream?.getVideoTracks?.()[0];
    if (!videoTrack || !zoomRange) return;

    const settings = videoTrack.getSettings?.() || {};
    const current = Number.isFinite(settings.zoom)
      ? settings.zoom
      : zoomValueRef.current;
    const step = Math.max(zoomRange.step || 0.1, 0.1);
    const next = Math.min(
      zoomRange.max,
      Math.max(zoomRange.min, current + (direction * step))
    );

    if (Math.abs(next - current) < 0.0001) return;

    try {
      await videoTrack.applyConstraints({
        advanced: [{ zoom: next }]
      });
      zoomValueRef.current = next;
      setZoomValue(next);
    } catch (error) {
      console.warn("ScenePilot zoom unavailable", error);
    }
  }

  function stopZoomHold() {
    if (zoomHoldTimer.current) {
      window.clearInterval(zoomHoldTimer.current);
      zoomHoldTimer.current = null;
    }
  }

  function startZoomHold(direction, mediaStream = stream) {
    stopZoomHold();
    changeZoom(direction, mediaStream);
    zoomHoldTimer.current = window.setInterval(() => {
      changeZoom(direction, mediaStream);
    }, 90);
  }

  function sendDirectorZoom(camera, action, direction = 0) {
    if (!camera?.socketId) return;
    socket.emit("camera:control", {
      room: roomCode,
      target: camera.socketId,
      command: "zoom",
      action,
      direction
    });
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

    function stopTelemetrySharing() {
    setTelemetryAllowed(false);
    setCameraTelemetry(current => ({
      ...current,
      battery: null,
      charging: null,
      network: null,
      status: "NOT SHARED"
    }));

    if (socket.connected) {
      socket.emit("camera:telemetry", {
        room: roomCode,
        battery: null,
        charging: null,
        network: null,
        telemetryConsent: false,
        support: {
          battery: Boolean(navigator.getBattery),
          network: Boolean(
            navigator.connection ||
            navigator.mozConnection ||
            navigator.webkitConnection
          )
        }
      });
    }
  }

async function enableCamera() {
    try {
      if (!networkId || !cameraJoinToken) {
        throw new Error("This camera link is missing its ScenePilot network access token. Scan the company's current QR code again.");
      }
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

      try {
        if ("wakeLock" in navigator && !wakeLock.current) {
          wakeLock.current = await navigator.wakeLock.request("screen");
        }
      } catch (error) {
        console.warn("ScenePilot automatic camera wake lock unavailable", error);
      }
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

      const handleCameraControl = payload => {
        if (payload?.command !== "zoom") return;
        if (payload.action === "start") {
          const direction = Number(payload.direction) < 0 ? -1 : 1;
          startZoomHold(direction, media);
        } else if (payload.action === "stop") {
          stopZoomHold();
        }
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
      socket.off("camera:control");

      socket.on("connect", handleConnect);
      socket.on("disconnect", handleDisconnect);
      socket.on("webrtc:offer", handleOffer);
      socket.on("webrtc:ice", handleIce);
      socket.on("camera:registered", handleRegistered);
      socket.on("program:status", handleProgramStatus);
      socket.on("camera:control", handleCameraControl);

      socket.setNetwork(networkId, cameraJoinToken);
      socket.setRoom(roomCode);
      socket.connect();
    } catch (error) {
      setSignalStatus("CAMERA ACCESS FAILED");
      alert(`Camera access failed: ${error.message}`);
    }
  }

  async function openDirectorCamera(facing = directorFacingMode) {
    if (showCamera) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setDirectorCameraStatus("UNSUPPORTED");
      return;
    }

    try {
      setDirectorCameraStatus("REQUESTING");

      directorStream?.getTracks?.().forEach(track => track.stop());

      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      setDirectorFacingMode(facing);
      setDirectorStream(media);
      setDirectorCameraStatus(
        facing === "environment" ? "REAR CAMERA READY" : "FRONT CAMERA READY"
      );
    } catch (error) {
      console.error("ScenePilot Director Cam failed", error);
      setDirectorCameraStatus("CAMERA BLOCKED");
    }
  }

  async function enableDirectorCamera() {
    if (directorStream) return;
    await openDirectorCamera("user");
  }

  async function switchDirectorCamera() {
    if (!directorStream) return;

    const nextFacing =
      directorFacingMode === "user" ? "environment" : "user";

    await openDirectorCamera(nextFacing);
  }

  function stopDirectorCamera() {
    directorStream?.getTracks?.().forEach(track => track.stop());
    setDirectorStream(null);
    setDirectorCameraStatus("OFF");

    if (preview === DIRECTOR_SOURCE) {
      setPreview(mainCamera);
      setPreviewDirty(true);
    }

    if (secondaryPreview === DIRECTOR_SOURCE) {
      const fallbackSecondary =
        mainCamera === DIRECTOR_SOURCE
          ? wirelessCameras[0]?.slotId || 1
          : mainCamera === preview
            ? wirelessCameras.find(camera => camera.slotId !== preview)?.slotId || 1
            : mainCamera;
      setSecondaryPreview(fallbackSecondary);
      setPreviewDirty(true);
    }

    if (mainCamera === DIRECTOR_SOURCE) {
      const fallbackMain = wirelessCameras[0]?.slotId || 1;
      setMainCamera(fallbackMain);
      try {
        window.localStorage.setItem(
          `scenepilot:mainCamera:${roomCode}`,
          String(fallbackMain)
        );
      } catch (error) {
        console.warn("ScenePilot Main Cam fallback could not be saved", error);
      }
    }
  }

  function putDirectorInPreview() {
    if (!directorStream) return;
    setCompositionMode("single");
    setPreview(DIRECTOR_SOURCE);
    setPreviewDirty(true);
  }

  function putDirectorInPip() {
    if (!directorStream) return;

    let primary = preview;
    if (primary === DIRECTOR_SOURCE) {
      primary = mainCamera;
      setPreview(primary);
    }

    setCompositionMode("pip");
    setSecondaryPreview(DIRECTOR_SOURCE);
    setPreviewDirty(true);
  }

  function stopCamera() {
    stream?.getTracks().forEach(track => track.stop());
    wakeLock.current?.release?.().catch?.(() => {});
    wakeLock.current = null;

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

  function applyProgramComposition(nextComposition) {
    setProgram(nextComposition.primary);
    setProgramComposition(nextComposition);
    setProgramTransition(current => ({
      type: transition,
      duration: transition === "CUT" ? 0 : duration,
      key: current.key + 1
    }));
  }

  function take() {
    if (!preview) return;

    const nextSecondary =
      compositionMode === "single" || compositionMode === "nine"
        ? null
        : secondaryPreview;

    const compositionChanged =
      programComposition.mode !== compositionMode ||
      programComposition.primary !== preview ||
      programComposition.secondary !== nextSecondary;

    if (previewDirty || compositionChanged) {
      applyProgramComposition({
        mode: compositionMode,
        primary: preview,
        secondary: nextSecondary
      });
      setPreviewDirty(false);
      return;
    }

    if (
      programComposition.mode !== "single" ||
      programComposition.primary !== mainCamera
    ) {
      applyProgramComposition({
        mode: "single",
        primary: mainCamera,
        secondary: null
      });
    }
  }

  function chooseCompositionMode(mode) {
    setCompositionMode(mode);
    setPreviewDirty(true);
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

    if (compositionMode === "single" || compositionMode === "nine") {
      setPreview(slotId);
      setPreviewDirty(true);
      return;
    }

    if (preview === slotId) {
      return;
    }

    setSecondaryPreview(slotId);
    setPreviewDirty(true);
  }

  useEffect(() => {
    setCameraAudio(current => {
      const next = { ...current };

      wirelessCameras.forEach(camera => {
        if (!next[camera.socketId]) {
          next[camera.socketId] = { volume: 1, muted: true, solo: false };
        }
      });

      if (directorStream && !next[DIRECTOR_SOURCE]) {
        next[DIRECTOR_SOURCE] = { volume: 1, muted: true, solo: false };
      }

      Object.keys(next).forEach(id => {
        const isRemoteCamera =
          wirelessCameras.some(camera => camera.socketId === id);
        const isDirectorCamera =
          id === DIRECTOR_SOURCE && Boolean(directorStream);

        if (!isRemoteCamera && !isDirectorCamera) {
          delete next[id];
        }
      });

      return next;
    });
  }, [wirelessCameras, directorStream]);

  const anySolo = Object.values(cameraAudio).some(channel => channel.solo);

  const effectiveCameraVolume = camera => {
    const channel = cameraAudio[camera.socketId] || { volume: 1, muted: true, solo: false };
    const selectedByMaster =
      masterAudioSource === "mix" || masterAudioSource === camera.socketId;
    const audibleBySolo = !anySolo || channel.solo;

    if (!selectedByMaster || !audibleBySolo || channel.muted) return 0;
    return Math.max(0, Math.min(1, Number(channel.volume ?? 1)));
  };

  const effectiveDirectorVolume = () => {
    const channel = cameraAudio[DIRECTOR_SOURCE] || {
      volume: 1,
      muted: true,
      solo: false
    };
    const selectedByMaster =
      masterAudioSource === "mix" || masterAudioSource === DIRECTOR_SOURCE;
    const audibleBySolo = !anySolo || channel.solo;

    if (!selectedByMaster || !audibleBySolo || channel.muted) return 0;
    return Math.max(0, Math.min(1, Number(channel.volume ?? 1)));
  };

  const updateCameraAudio = (socketId, patch) => {
    setCameraAudio(current => ({
      ...current,
      [socketId]: {
        volume: 1,
        muted: true,
        solo: false,
        ...(current[socketId] || {}),
        ...patch
      }
    }));
  };

  useEffect(() => {
    wirelessCameras.forEach(camera => {
      const el = audioElements.current[camera.socketId];
      if (!el) return;
      const volume = effectiveCameraVolume(camera);
      el.volume = volume;
      el.muted = volume === 0;
      el.play?.().catch(() => {});
    });

    if (!directorStream && masterAudioSource === DIRECTOR_SOURCE) {
      setMasterAudioSource("mix");
    }
  }, [
    cameraAudio,
    masterAudioSource,
    wirelessCameras,
    remoteStreams,
    directorStream
  ]);

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
          <span className="room-pill">{network?.name || "SCENEPILOT NETWORK"} • ROOM {roomCode}</span>
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
                    onPointerDown={event => {
                      event.preventDefault();
                      event.currentTarget.setPointerCapture?.(event.pointerId);
                      startZoomHold(-1);
                    }}
                    onPointerUp={stopZoomHold}
                    onPointerCancel={stopZoomHold}
                    onPointerLeave={stopZoomHold}
                    onKeyDown={event => {
                      if ((event.key === "Enter" || event.key === " ") && !event.repeat) startZoomHold(-1);
                    }}
                    onKeyUp={event => {
                      if (event.key === "Enter" || event.key === " ") stopZoomHold();
                    }}
                    disabled={!zoomRange || zoomValue <= zoomRange.min}
                    title={zoomRange ? "Press and hold to zoom out" : "Optical zoom is unavailable on this camera"}
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
                    onPointerDown={event => {
                      event.preventDefault();
                      event.currentTarget.setPointerCapture?.(event.pointerId);
                      startZoomHold(1);
                    }}
                    onPointerUp={stopZoomHold}
                    onPointerCancel={stopZoomHold}
                    onPointerLeave={stopZoomHold}
                    onKeyDown={event => {
                      if ((event.key === "Enter" || event.key === " ") && !event.repeat) startZoomHold(1);
                    }}
                    onKeyUp={event => {
                      if (event.key === "Enter" || event.key === " ") stopZoomHold();
                    }}
                    disabled={!zoomRange || zoomValue >= zoomRange.max}
                    title={zoomRange ? "Press and hold to zoom in" : "Optical zoom is unavailable on this camera"}
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

            <div className="telemetry-consent">
              <div>
                <strong>DEVICE TELEMETRY</strong>
                <span>
                  Share battery and network quality with the Director when this browser supports it.
                  ScenePilot does not request location for telemetry.
                </span>
              </div>

              {!telemetryAllowed ? (
                <button type="button" onClick={() => setTelemetryAllowed(true)}>
                  ALLOW DEVICE TELEMETRY
                </button>
              ) : (
                <button type="button" className="telemetry-stop" onClick={stopTelemetrySharing}>
                  STOP SHARING
                </button>
              )}
            </div>

            <div className="operator-status telemetry-status">
              <span>
                <Wifi size={17}/>
                {telemetryAllowed
                  ? cameraTelemetry.networkSupported
                    ? cameraTelemetry.network?.bars === 4
                      ? "NETWORK EXCELLENT"
                      : cameraTelemetry.network?.bars === 3
                        ? "NETWORK GOOD"
                        : cameraTelemetry.network?.bars === 2
                          ? "NETWORK FAIR"
                          : cameraTelemetry.network?.bars === 1
                            ? "NETWORK WEAK"
                            : "NETWORK LIMITED"
                    : "NETWORK UNSUPPORTED"
                  : "NETWORK NOT SHARED"}
              </span>

              <span>
                <BatteryFull size={17}/>
                {telemetryAllowed
                  ? cameraTelemetry.batterySupported
                    ? Number.isFinite(cameraTelemetry.battery)
                      ? `${cameraTelemetry.battery}%${cameraTelemetry.charging ? " CHARGING" : ""}`
                      : "BATTERY WAITING"
                    : "BATTERY UNSUPPORTED"
                  : "BATTERY NOT SHARED"}
              </span>

              <span><Mic2 size={17}/> {stream ? "AUDIO ALLOWED" : "AUDIO PERMISSION ON START"}</span>
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
                <p><strong>4.</strong> Choose ALLOW DEVICE TELEMETRY if you want the Director to see battery and browser-reported network quality. You can stop sharing at any time.</p>
                <p><strong>5.</strong> Tap Enable Camera + Microphone and allow the browser's native camera/microphone permission prompt.</p>
                <p><strong>6.</strong> ScenePilot assigns the next available camera slot automatically.</p>
                <p><strong>7.</strong> LIVE TO DIRECTOR means the WebRTC media connection is active.</p>
                <p><strong>8.</strong> Use FLIP to switch between the rear and front camera without leaving the production.</p>
                <p><strong>9.</strong> Zoom controls use the phone camera's hardware zoom when the browser supports it.</p>
                <p><strong>10.</strong> If the connection drops, leave the page open while ScenePilot reconnects.</p>
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

  const networkLabelForCamera = camera => {
    if (!camera) return "OFFLINE";
    if (camera.telemetryConsent === false) return "NOT SHARED";
    if (camera.telemetrySupport?.network === false) return "UNSUPPORTED";

    const bars = camera.network?.bars;
    if (bars === 4) return "EXCELLENT";
    if (bars === 3) return "GOOD";
    if (bars === 2) return "FAIR";
    if (bars === 1) return "WEAK";
    return "LIMITED";
  };

  const batteryLabelForCamera = camera => {
    if (!camera) return "OFFLINE";
    if (camera.telemetryConsent === false) return "NOT SHARED";
    if (camera.telemetrySupport?.battery === false) return "UNSUPPORTED";
    if (!Number.isFinite(camera.battery)) return "NOT SHARED";
    return `${camera.battery}%${camera.charging ? " ⚡" : ""}`;
  };

  const displayNameForCamera = slotId => {
    if (slotId === DIRECTOR_SOURCE) return "DIRECTOR CAM";

    const savedName = cameraNames[String(slotId)] || cameraNames[slotId];
    if (savedName) return savedName;

    const liveCamera = cameraForSlot(slotId);
    if (liveCamera?.name) return liveCamera.name;

    return cameras.find(camera => camera.id === slotId)?.name || `CAM ${String(slotId).padStart(2, "0")}`;
  };

  const openSetNames = () => {
    const next = {};
    cameras.forEach(camera => {
      next[camera.id] = displayNameForCamera(camera.id);
    });
    setDraftCameraNames(next);
    setShowSetNames(true);
  };

  const saveCameraNames = event => {
    event?.preventDefault?.();

    const next = {};
    cameras.forEach(camera => {
      const value = String(draftCameraNames[camera.id] || "").trim().slice(0, 80);
      next[camera.id] = value || `CAM ${String(camera.id).padStart(2, "0")}`;
    });

    setCameraNames(next);

    try {
      window.localStorage.setItem(
        `scenepilot:cameraNames:${roomCode}`,
        JSON.stringify(next)
      );
    } catch (error) {
      console.warn("ScenePilot camera names could not be saved locally", error);
    }

    window.dispatchEvent(
      new CustomEvent("scenepilot:camera-names", {
        detail: { roomCode, names: next }
      })
    );

    setShowSetNames(false);
  };

  const dropCameraOnMain = slotId => {
    const next =
      slotId === DIRECTOR_SOURCE ? DIRECTOR_SOURCE : Number(slotId);

    if (next === DIRECTOR_SOURCE) {
      if (!directorStream) return;
    } else if (!next || next < 1 || next > 9 || !cameraForSlot(next)) {
      return;
    }

    setMainCamera(next);

    try {
      window.localStorage.setItem(
        `scenepilot:mainCamera:${roomCode}`,
        String(next)
      );
    } catch (error) {
      console.warn("ScenePilot Main Cam assignment could not be saved", error);
    }
  };

  const streamForSlot = slotId => {
    if (slotId === DIRECTOR_SOURCE) return directorStream;

    const camera = cameraForSlot(slotId);
    return camera ? remoteStreams[camera.socketId] : null;
  };

  const isProgramSlot = slotId => {
    if (instantReplayMode === "program") return false;

    if (programComposition.mode === "nine") return true;
    if (programComposition.mode === "split" || programComposition.mode === "pip") {
      return [programComposition.primary, programComposition.secondary].includes(slotId);
    }
    return programComposition.primary === slotId;
  };

  const renderSource = (slotId, variant = "preview") => {
    const liveStream = streamForSlot(slotId);
    const fallbackCamera = cameras.find(camera => camera.id === slotId);
    const liveCamera = cameraForSlot(slotId);

    if (liveStream) {
      return (
        <LiveStreamVideo
          stream={liveStream}
          className="composition-video"
        />
      );
    }

    return (
      <div className={`fake-feed ${variant === "program" ? "program-feed" : "preview-feed"}`}>
        <Camera size={44}/>
        <strong>
          {slotId === DIRECTOR_SOURCE
            ? "DIRECTOR CAM"
            : `CAM ${String(slotId).padStart(2,"0")}`}
        </strong>
        <span>
          {slotId === DIRECTOR_SOURCE
            ? "LOCAL SELFIE SOURCE"
            : liveCamera?.name || fallbackCamera?.name || "SOURCE"}
        </span>
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
          <strong>LIVE COMMAND • DIRECTOR CONTROL</strong>
        </div>

        <div className="top-actions">
          <span className="network"><i/> {signalStatus}</span>
          <button onClick={() => setShowJoin(true)}><Users size={18}/> ADD CAMERA</button>
          <button onClick={() => setShowTips(true)}><CircleHelp size={18}/> TIPS</button>
          <button className="icon-button"><Settings size={19}/></button>
        </div>
      </header>

      {directorLockMessage && (
        <div className="director-lock-banner">
          <ShieldCheck size={16}/>
          <div>
            <strong>DIRECTOR SESSION LOCKED</strong>
            <span>{directorLockMessage}</span>
          </div>
        </div>
      )}

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
                const rawSource =
                  event.dataTransfer.getData("text/scenepilot-camera") ||
                  draggingCamera;
                const sourceId =
                  rawSource === DIRECTOR_SOURCE
                    ? DIRECTOR_SOURCE
                    : Number(rawSource);
                dropCameraOnPreview(sourceId);
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
              ) : compositionMode === "nine" ? (
                <div className="composition nine-composition">
                  <div className="nine-main-pane">
                    {renderSource(preview, "preview")}
                    <span className="composition-label">MAIN • {displayNameForCamera(preview)}</span>
                  </div>
                  <div className="nine-side-grid">
                    {cameras
                      .filter(camera => camera.id !== preview)
                      .map(camera => (
                        <div className="nine-mini-pane" key={camera.id}>
                          {renderSource(camera.id, "preview")}
                          <span className="composition-label">
                            {displayNameForCamera(camera.id)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              ) : compositionMode === "split" ? (
                <div className="composition split-composition">
                  <div className="composition-pane">
                    {renderSource(preview, "preview")}
                    <span className="composition-label">{displayNameForCamera(preview)}</span>
                  </div>
                  <div className="composition-pane">
                    {renderSource(secondaryPreview, "preview")}
                    <span className="composition-label">{displayNameForCamera(secondaryPreview)}</span>
                  </div>
                </div>
              ) : compositionMode === "pip" ? (
                <div className="composition pip-composition">
                  <div className="pip-main">
                    {renderSource(preview, "preview")}
                  </div>
                  <div className="pip-window">
                    {renderSource(secondaryPreview, "preview")}
                    <span className="composition-label">{displayNameForCamera(secondaryPreview)}</span>
                  </div>
                </div>
              ) : (
                renderSource(preview, "preview")
              )}
              <span className="source-tag">
                {instantReplayMode === "preview"
                  ? `REPLAY ${instantReplaySeconds}S`
                  : compositionMode === "single"
                    ? displayNameForCamera(preview)
                    : compositionMode === "nine"
                      ? `9-CAM • MAIN ${displayNameForCamera(preview)}`
                      : `${compositionMode.toUpperCase()} • ${displayNameForCamera(preview)} + ${displayNameForCamera(secondaryPreview)}`}
              </span>
              <button className="fullscreen"><Maximize2 size={17}/></button>
            </div>
          </div>

          <div className="monitor program-monitor">
            <div className="monitor-head">
              <span>PROGRAM</span>
              <strong>PGM</strong>
            </div>
            <div
              key={`program-${programTransition.key}`}
              className={`screen program-screen transition-${programTransition.type.toLowerCase()}`}
              style={{ "--transition-duration": `${programTransition.duration}ms` }}
            >
              {instantReplayMode === "program" && instantReplayUrl ? (
                <video
                  ref={instantReplayVideoRef}
                  src={instantReplayUrl}
                  className="composition-video instant-replay-video"
                  autoPlay
                  playsInline
                  onEnded={returnToLive}
                />
              ) : programComposition.mode === "nine" ? (
                <div className="composition nine-composition">
                  <div className="nine-main-pane">
                    {renderSource(programComposition.primary, "program")}
                    <span className="composition-label">
                      MAIN • {displayNameForCamera(programComposition.primary)}
                    </span>
                  </div>
                  <div className="nine-side-grid">
                    {cameras
                      .filter(camera => camera.id !== programComposition.primary)
                      .map(camera => (
                        <div className="nine-mini-pane" key={camera.id}>
                          {renderSource(camera.id, "program")}
                          <span className="composition-label">
                            {displayNameForCamera(camera.id)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              ) : programComposition.mode === "split" ? (
                <div className="composition split-composition">
                  <div className="composition-pane">
                    {renderSource(programComposition.primary, "program")}
                    <span className="composition-label">{displayNameForCamera(programComposition.primary)}</span>
                  </div>
                  <div className="composition-pane">
                    {renderSource(programComposition.secondary, "program")}
                    <span className="composition-label">{displayNameForCamera(programComposition.secondary)}</span>
                  </div>
                </div>
              ) : programComposition.mode === "pip" ? (
                <div className="composition pip-composition">
                  <div className="pip-main">
                    {renderSource(programComposition.primary, "program")}
                  </div>
                  <div className="pip-window">
                    {renderSource(programComposition.secondary, "program")}
                    <span className="composition-label">{displayNameForCamera(programComposition.secondary)}</span>
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
                    ? displayNameForCamera(programComposition.primary)
                    : programComposition.mode === "nine"
                      ? `9-CAM • MAIN ${displayNameForCamera(programComposition.primary)}`
                      : `${programComposition.mode.toUpperCase()} • ${displayNameForCamera(programComposition.primary)} + ${displayNameForCamera(programComposition.secondary)}`}
              </span>
              <button className="fullscreen"><Maximize2 size={17}/></button>
            </div>
          </div>
        </section>

        <section className="camera-bank">
          <div className="section-title">
            <div><span>SOURCES</span><strong>CAMERA MULTIVIEW</strong></div>
            <div className="section-title-actions">
              <span>{
                cameras.filter(c =>
                  c.status !== "OFFLINE" ||
                  Boolean(cameraForSlot(c.id))
                ).length
              } / 9 CONNECTED</span>
              <button className="set-names-button" onClick={openSetNames}>
                <Type size={14}/> SET NAMES
              </button>
            </div>
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
                onClick={() => {
                  setPreview(cam.id);
                  setPreviewDirty(true);
                }}
                className={`camera-tile
                  ${isProgramSlot(cam.id) && cameraForSlot(cam.id) ? "is-program" : ""}
                  ${cam.id === preview ? "is-preview" : ""}
                  ${cam.status === "OFFLINE" && !cameraForSlot(cam.id) ? "offline" : ""}`}
              >
                <div className="tile-feed">
                  {streamForSlot(cam.id) ? (
                    <LiveStreamVideo stream={streamForSlot(cam.id)}/>
                  ) : (
                    <>
                      <Camera size={27}/>
                      <span>CAM {String(cam.id).padStart(2,"0")}</span>
                    </>
                  )}
                </div>

                <div className="tile-meta">
                  <strong>{displayNameForCamera(cam.id)}</strong>
                  {cameraForSlot(cam.id) && (
                    <span className="drag-hint">DRAG TO PREVIEW OR MAIN CAM</span>
                  )}
                  <div>
                    <span title="Camera operator network telemetry when the phone/browser shares it">
                      <Wifi size={12}/>
                      {networkLabelForCamera(cameraForSlot(cam.id))}
                    </span>
                    <span title="Battery telemetry is shown only after operator consent and when the browser exposes it">
                      <BatteryFull size={13}/>
                      {batteryLabelForCamera(cameraForSlot(cam.id))}
                    </span>
                  </div>
                </div>

                {isProgramSlot(cam.id) && cameraForSlot(cam.id) && <span className="bus-label pgm">PGM</span>}
                {cam.id === preview && <span className="bus-label pvw">PVW</span>}
              </button>
            ))}
          </div>

          <div className="director-camera-panel">
            <div className="director-camera-copy">
              <span>LOCAL SOURCE</span>
              <strong>DIRECTOR CAM</strong>
              <small>
                Use the Director device front or rear camera as a production source.
                It stays separate from the nine remote camera slots.
              </small>

              <div className="director-camera-actions">
                {!directorStream ? (
                  <button onClick={enableDirectorCamera}>
                    <Camera size={15}/> ENABLE SELFIE CAM
                  </button>
                ) : (
                  <>
                    <button onClick={putDirectorInPreview}>
                      <MonitorUp size={15}/> PREVIEW
                    </button>
                    <button onClick={putDirectorInPip}>
                      <PictureInPicture2 size={15}/> ADD AS PiP
                    </button>
                    <button onClick={switchDirectorCamera}>
                      <RefreshCw size={15}/> SWITCH CAMERA
                    </button>
                    <button className="director-camera-stop" onClick={stopDirectorCamera}>
                      <PhoneOff size={15}/> TURN OFF
                    </button>
                  </>
                )}
              </div>

              <span className={`director-camera-status ${directorStream ? "ready" : ""}`}>
                <i/> {directorCameraStatus}
              </span>
            </div>

            <div
              className={`director-camera-feed ${directorStream ? "draggable" : ""} ${directorFacingMode === "environment" ? "rear-camera" : "front-camera"}`}
              draggable={Boolean(directorStream)}
              onDragStart={event => {
                if (!directorStream) return;
                setDraggingCamera(DIRECTOR_SOURCE);
                event.dataTransfer.effectAllowed = "copy";
                event.dataTransfer.setData("text/scenepilot-camera", DIRECTOR_SOURCE);
              }}
              onDragEnd={() => setDraggingCamera(null)}
              onClick={() => {
                if (directorStream) putDirectorInPreview();
              }}
              title={directorStream ? "Drag to Preview or tap to preview" : "Enable Director Cam first"}
            >
              {directorStream ? (
                <LiveStreamVideo stream={directorStream}/>
              ) : (
                <div className="director-camera-placeholder">
                  <Camera size={27}/>
                  <strong>SELFIE CAMERA OFF</strong>
                  <span>Enable when the Director wants to join the production.</span>
                </div>
              )}

              {directorStream && (
                <>
                  <span className="director-camera-label">
                    DIRECTOR CAM • {directorFacingMode === "environment" ? "REAR" : "FRONT"}
                  </span>
                  <span className="director-camera-drag">DRAG TO PREVIEW OR MAIN</span>
                </>
              )}

              {isProgramSlot(DIRECTOR_SOURCE) && directorStream && (
                <span className="home-live-badge"><i/> LIVE</span>
              )}
            </div>
          </div>

          <div
            className={`main-camera-home ${draggingCamera ? "drag-active" : ""}`}
            onDragOver={event => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={event => {
              event.preventDefault();
              const rawSource =
                event.dataTransfer.getData("text/scenepilot-camera") ||
                draggingCamera;
              const sourceId =
                rawSource === DIRECTOR_SOURCE
                  ? DIRECTOR_SOURCE
                  : Number(rawSource);

              dropCameraOnMain(sourceId);
              setDraggingCamera(null);
            }}
          >
            <div className="main-camera-home-copy">
              <span>HOME SHOT</span>
              <strong>MAIN CAM</strong>
              <small>Drag any connected camera or Director Cam here. TAKE returns to this source when no new Preview shot is selected.</small>
            </div>
            <div className="main-camera-home-feed">
              {streamForSlot(mainCamera) ? (
                <LiveStreamVideo stream={streamForSlot(mainCamera)}/>
              ) : (
                <div className="main-camera-placeholder">
                  <Camera size={24}/>
                  <span>
                    {mainCamera === DIRECTOR_SOURCE
                      ? "WAITING FOR DIRECTOR CAM"
                      : `WAITING FOR CAM ${String(mainCamera).padStart(2, "0")}`}
                  </span>
                </div>
              )}
              <span className="main-camera-name">
                {mainCamera === DIRECTOR_SOURCE
                  ? "DIRECTOR CAM • LOCAL SOURCE"
                  : `${displayNameForCamera(mainCamera)} • CAM ${String(mainCamera).padStart(2, "0")}`}
              </span>
              {isProgramSlot(mainCamera) && (
                <span className="home-live-badge"><i/> HOME LIVE</span>
              )}
            </div>
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

            <button className="take-button" onClick={take}>
              <span>TAKE</span>
              <small>{transition} • {duration}ms</small>
            </button>
          </div>

          <div className="audio-panel">
            <div className="panel-label">MASTER AUDIO</div>

            <label className="audio-master-select">
              <span>SOURCE</span>
              <select
                value={masterAudioSource}
                onChange={event => setMasterAudioSource(event.target.value)}
              >
                <option value="mix">MIX ALL ACTIVE MICS</option>
                {directorStream && (
                  <option value={DIRECTOR_SOURCE}>DIRECTOR CAM — LOCAL MIC</option>
                )}
                {wirelessCameras.map(camera => (
                  <option key={camera.socketId} value={camera.socketId}>
                    CAM {String(camera.slotId || "?").padStart(2, "0")} — {displayNameForCamera(camera.slotId)}
                  </option>
                ))}
              </select>
            </label>

            <div className="phone-mixer">
              {directorStream && (() => {
                const channel = cameraAudio[DIRECTOR_SOURCE] || {
                  volume: 1,
                  muted: true,
                  solo: false
                };
                const volume = effectiveDirectorVolume();

                return (
                  <div className="phone-mixer-channel director-audio-channel">
                    <div className="phone-mixer-head">
                      <strong>DIRECTOR CAM</strong>
                      <span>LOCAL MIC • MONITOR MUTED</span>
                    </div>

                    <input
                      className="phone-fader"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={channel.volume}
                      onChange={event => {
                        updateCameraAudio(DIRECTOR_SOURCE, {
                          volume: Number(event.target.value)
                        });
                      }}
                    />

                    <div className="phone-mixer-actions">
                      <button
                        className={channel.muted ? "active" : ""}
                        onClick={() =>
                          updateCameraAudio(DIRECTOR_SOURCE, {
                            muted: !channel.muted
                          })
                        }
                      >
                        MUTE
                      </button>
                      <button
                        className={channel.solo ? "active" : ""}
                        onClick={() =>
                          updateCameraAudio(DIRECTOR_SOURCE, {
                            solo: !channel.solo
                          })
                        }
                      >
                        SOLO
                      </button>
                      <span>
                        {Math.round(Number(channel.volume || 0) * 100)}%
                        {volume === 0 ? " • OFF" : ""}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {wirelessCameras.length ? wirelessCameras.map(camera => {
                const channel = cameraAudio[camera.socketId] || {
                  volume: 1,
                  muted: true,
                  solo: false
                };
                const stream = remoteStreams[camera.socketId];
                const volume = effectiveCameraVolume(camera);

                return (
                  <div className="phone-mixer-channel" key={camera.socketId}>
                    <audio
                      autoPlay
                      playsInline
                      ref={el => {
                        if (!el) {
                          delete audioElements.current[camera.socketId];
                          return;
                        }
                        audioElements.current[camera.socketId] = el;
                        if (stream && el.srcObject !== stream) {
                          el.srcObject = stream;
                          el.play?.().catch(() => {});
                        }
                        el.volume = volume;
                        el.muted = volume === 0;
                      }}
                    />

                    <div className="phone-mixer-head">
                      <strong>{displayNameForCamera(camera.slotId)}</strong>
                      <span>CAM {String(camera.slotId || "?").padStart(2, "0")}</span>
                    </div>

                    <input
                      className="phone-fader"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={channel.volume}
                      onChange={event => {
                        const nextVolume = Number(event.target.value);
                        updateCameraAudio(camera.socketId, { volume: nextVolume });
                        const el = audioElements.current[camera.socketId];
                        if (el) {
                          el.volume = nextVolume;
                          el.muted = Boolean(channel.muted);
                        }
                      }}
                    />

                    <div className="phone-mixer-actions">
                      <button
                        className={channel.muted ? "active" : ""}
                        onClick={() => updateCameraAudio(camera.socketId, { muted: !channel.muted })}
                      >
                        MUTE
                      </button>
                      <button
                        className={channel.solo ? "active" : ""}
                        onClick={() => updateCameraAudio(camera.socketId, { solo: !channel.solo })}
                      >
                        SOLO
                      </button>
                      <span>{Math.round(Number(channel.volume || 0) * 100)}%</span>
                    </div>
                  </div>
                );
              }) : !directorStream ? (
                <div className="phone-mixer-empty">
                  Connect a phone or enable Director Cam to expose a microphone channel.
                </div>
              ) : null}
            </div>

            <div className="audio-footer">
              <span><Volume2 size={15}/> LIVE AUDIO MIXER</span>
              <span>{wirelessCameras.length + (directorStream ? 1 : 0)} CH</span>
            </div>
          </div>

          <div className="remote-camera-control-panel">
            <div className="panel-label">REMOTE CAMERA CONTROL</div>
            <div className="remote-camera-control-head">
              <strong>DIRECTOR ZOOM</strong>
              <span>PRESS + HOLD • HARDWARE ZOOM WHEN SUPPORTED</span>
            </div>

            <div className="remote-camera-control-grid">
              {wirelessCameras.length ? wirelessCameras.map(camera => (
                <div className="remote-camera-control-card" key={camera.socketId}>
                  <div>
                    <strong>{displayNameForCamera(camera.slotId)}</strong>
                    <span>CAM {String(camera.slotId || "?").padStart(2, "0")}</span>
                  </div>
                  <div className="remote-camera-zoom-buttons">
                    <button
                      type="button"
                      onPointerDown={event => {
                        event.preventDefault();
                        event.currentTarget.setPointerCapture?.(event.pointerId);
                        sendDirectorZoom(camera, "start", -1);
                      }}
                      onPointerUp={() => sendDirectorZoom(camera, "stop")}
                      onPointerCancel={() => sendDirectorZoom(camera, "stop")}
                      onPointerLeave={() => sendDirectorZoom(camera, "stop")}
                      title="Press and hold to remotely zoom out"
                    >
                      <ZoomOut size={16}/> ZOOM OUT
                    </button>
                    <button
                      type="button"
                      onPointerDown={event => {
                        event.preventDefault();
                        event.currentTarget.setPointerCapture?.(event.pointerId);
                        sendDirectorZoom(camera, "start", 1);
                      }}
                      onPointerUp={() => sendDirectorZoom(camera, "stop")}
                      onPointerCancel={() => sendDirectorZoom(camera, "stop")}
                      onPointerLeave={() => sendDirectorZoom(camera, "stop")}
                      title="Press and hold to remotely zoom in"
                    >
                      <ZoomIn size={16}/> ZOOM IN
                    </button>
                  </div>
                </div>
              )) : (
                <div className="remote-camera-control-empty">
                  Connect a wireless camera to expose director zoom controls.
                </div>
              )}
            </div>
          </div>

          <div className="production-tools">
            <div className="panel-label">LIVE LAYOUT</div>

            <div className="layout-mode-grid">
              <button
                className={compositionMode === "single" ? "active" : ""}
                onClick={() => chooseCompositionMode("single")}
              >
                <MonitorUp size={18}/><span>SINGLE</span>
              </button>

              <button
                className={compositionMode === "split" ? "active" : ""}
                onClick={() => chooseCompositionMode("split")}
              >
                <Layers size={18}/><span>SPLIT</span>
              </button>

              <button
                className={compositionMode === "pip" ? "active" : ""}
                onClick={() => chooseCompositionMode("pip")}
              >
                <PictureInPicture2 size={18}/><span>PiP</span>
              </button>

              <button
                className={compositionMode === "nine" ? "active" : ""}
                onClick={() => chooseCompositionMode("nine")}
              >
                <Users size={18}/><span>9-CAM</span>
              </button>
            </div>

            {compositionMode !== "single" && compositionMode !== "nine" && (
              <div className="secondary-source-picker">
                <label>SECOND CAMERA</label>
                <select
                  value={secondaryPreview}
                  onChange={event => {
                    const value = event.target.value;
                    setSecondaryPreview(
                      value === DIRECTOR_SOURCE ? DIRECTOR_SOURCE : Number(value)
                    );
                    setPreviewDirty(true);
                  }}
                >
                  {cameras.map(camera => (
                    <option key={camera.id} value={camera.id}>
                      CAM {String(camera.id).padStart(2,"0")} • {displayNameForCamera(camera.id)}
                    </option>
                  ))}
                  {directorStream && (
                    <option value={DIRECTOR_SOURCE}>DIRECTOR CAM • LOCAL SELFIE</option>
                  )}
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

        <BroadcastGraphics />
        <BroadcastPanel roomCode={roomCode} />
        <ReplayStudio roomCode={roomCode} />
      </main>

      <footer>
        <span>SCENEPILOT ENGINE</span>
        <span><i/> SYSTEM READY</span>
        <span>ROOM {roomCode}</span>
        <span>00:00:00</span>
      </footer>

      {showSetNames && (
        <div className="modal-backdrop" onClick={() => setShowSetNames(false)}>
          <form className="join-modal set-names-modal" onSubmit={saveCameraNames} onClick={event => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setShowSetNames(false)}><X/></button>
            <div className="join-icon"><Type size={27}/></div>
            <span className="eyebrow">CAMERA LABELS</span>
            <h2>Set camera names</h2>
            <p>These names stay synchronized across Multiview, Preview, Program, Main Cam, Master Audio, and camera communications.</p>
            <div className="camera-name-grid">
              {cameras.map(camera => (
                <label key={camera.id}>
                  <span>CAM {String(camera.id).padStart(2, "0")}</span>
                  <input
                    value={draftCameraNames[camera.id] ?? ""}
                    onChange={event => setDraftCameraNames(current => ({
                      ...current,
                      [camera.id]: event.target.value
                    }))}
                    maxLength={80}
                    placeholder={`Camera ${String(camera.id).padStart(2, "0")}`}
                  />
                </label>
              ))}
            </div>
            <div className="set-names-actions">
              <button type="button" onClick={() => setShowSetNames(false)}>CANCEL</button>
              <button type="submit">SAVE NAMES</button>
            </div>
          </form>
        </div>
      )}

      {showTips && (
        <div className="modal-backdrop" onClick={() => setShowTips(false)}>
          <div className="join-modal tips-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowTips(false)}><X/></button>
            <div className="join-icon"><CircleHelp size={29}/></div>
            <span className="eyebrow">SCENEPILOT QUICK TIPS</span>
            <h2>Run the production</h2>
            <div className="tips-list">
              <p><strong>1. Set Names:</strong> Use SET NAMES above Camera Multiview to label one or all nine camera slots. A saved name follows that slot everywhere in the Director console.</p>
              <p><strong>2. Nine feeds stay live:</strong> Every connected camera keeps playing in Camera Multiview at all times. Preview, Program, Main Cam, and layouts reuse the same live MediaStream without stealing it from the wall.</p>
              <p><strong>3. Assign Main Cam:</strong> Drag any connected camera tile onto MAIN CAM below the nine-camera wall. That becomes the production's home shot.</p>
              <p><strong>4. Preview first:</strong> Tap a camera tile or drag it to Preview. Preview changes only the left monitor and does not put that camera on air.</p>
              <p><strong>5. TAKE:</strong> Press TAKE to send the current Preview/layout to Program. The red PGM indicator follows the source or sources actually live.</p>
              <p><strong>6. Return home:</strong> After a shot is taken, press TAKE again without choosing a new Preview shot to return Program to the assigned Main Cam. Pressing TAKE again can return to the prepared Preview shot.</p>
              <p><strong>7. Transitions:</strong> Select CUT, DISSOLVE, or FADE, choose 0.25s, 0.5s, or 1.0s, then press TAKE. The selected transition and duration now control the Program change.</p>
              <p><strong>8. Layouts:</strong> SINGLE, SPLIT, PiP, and 9-CAM are prepared in Preview first. TAKE sends the prepared layout to Program; another TAKE with no new selection returns to Main Cam.</p>
              <p><strong>9. Master Audio:</strong> Camera names from SET NAMES also appear in the Master Audio source list and phone mixer so video and audio labels match.</p>
              <p><strong>10. Director Cam:</strong> Enable the Director device camera from the dedicated Director Cam panel. Use SWITCH CAMERA for front/rear, then drag it to Preview, tap PREVIEW, or use ADD AS PiP. It never consumes one of the nine remote camera slots.</p>
              <p><strong>11. Camera phones:</strong> Connected phones can keep using flip, press-and-hold smooth zoom, Live Shield, telemetry, and camera communications while their live feed remains available to all Director monitors. The Director can also press and hold remote zoom controls for supported phone cameras.</p>
              <p><strong>12. Instant Replay:</strong> ScenePilot keeps the Program source buffered for replay when browser MediaRecorder support is available. Replay returns to the live Program automatically when it ends.</p>
              <p><strong>13. If a feed drops:</strong> Leave the camera page open while ScenePilot reconnects. The Multiview tile resumes from the same source slot when its WebRTC stream returns.</p>
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
            <p>
              This QR code is locked to <strong>{network?.name || "this company network"}</strong>
              {" "}and room {roomCode}. Cameras using another company's QR code cannot enter this production.
            </p>
            <div className="qr-wrap">
              {joinUrl ? (
                <QRCodeSVG value={joinUrl} size={190}/>
              ) : (
                <span>NETWORK QR LOADING…</span>
              )}
            </div>
            <div className="room-code"><span>NETWORK / ROOM</span><strong>{network?.name || "LOADING"} • {roomCode}</strong></div>
            <button
              className="camera-demo"
              disabled={!joinUrl}
              onClick={() => {
                if (joinUrl) window.location.assign(joinUrl);
              }}
            >
              OPEN CAMERA MODE ON THIS DEVICE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
