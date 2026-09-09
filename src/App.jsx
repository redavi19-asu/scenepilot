import { useEffect, useRef, useState } from "react";
import {
  Radio, Circle, Mic2, Volume2, Wifi, BatteryFull,
  Settings, Maximize2, MonitorUp, Users, QrCode,
  Type, Layers, PictureInPicture2, Video, Camera,
  Smartphone, X, CircleHelp, RefreshCw, ZoomIn, ZoomOut, PhoneOff, ShieldCheck, Flashlight,
  Scissors, Play, Save, Download, SkipBack, Film, Upload, Minimize2, Maximize
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import "./App.css";
import { socket } from "./socket";
import { createPeerConnection, optimizeVideoSender } from "./webrtc";
import ReplayStudio from "./ReplayStudio";
import BroadcastPanel from "./BroadcastPanel";
import BroadcastGraphics from "./BroadcastGraphics";

const qualityProfiles = {
  "1080p": { width: 1920, height: 1080, fps: 30, label: "1080P" },
  "720p": { width: 1280, height: 720, fps: 30, label: "720P" },
  "auto": { width: 1280, height: 720, fps: 24, label: "AUTO" }
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

function App({ user = null }) {
  const isOwner = user?.role === "owner";
  const [showSplash, setShowSplash] = useState(true);
  const [cameras, setCameras] = useState(initialCameras);
  const [program, setProgram] = useState(1);
  const [preview, setPreview] = useState(2);
  const [transition, setTransition] = useState("DISSOLVE");
  const [duration, setDuration] = useState(500);
  const [recording, setRecording] = useState(false);
  const [recordMode, setRecordMode] = useState("both");
  const [recordStatus, setRecordStatus] = useState("READY");
  const [pendingProgramMaster, setPendingProgramMaster] = useState(null);
  const [standby, setStandby] = useState(false);
  const standbyRef = useRef(false);
  const programCompositeAudioTracksRef = useRef([]);
  const productionRecordersRef = useRef([]);
  const productionChunksRef = useRef([]);
  const programCanvasRef = useRef(null);
  const programCompositeStreamRef = useRef(null);
  const programRenderFrameRef = useRef(0);
  const programVideoElementsRef = useRef({});
  const programLastFrameRef = useRef(null);
  const programTransitionStateRef = useRef({ key: 0, startedAt: 0, duration: 0, type: "CUT" });
  const graphicsStateRef = useRef({
    graphics: {
      live: false,
      lowerThird: false,
      ticker: false,
      countdown: false,
      topic: false,
      logo: false,
      headline: "",
      subheadline: "",
      tickerText: "",
      countdownLabel: "",
      logoText: "SP",
      topicSide: "right"
    },
    remaining: 0,
    topicImage: "",
    logoImage: ""
  });
  const [showJoin, setShowJoin] = useState(false);
  const [showCamera, setShowCamera] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("camera") === "1";
  });
  const [cameraSetupOpen, setCameraSetupOpen] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("camera") === "1";
  });
  const [cameraSetupBusy, setCameraSetupBusy] = useState(false);
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
  const [assignedSlot, setAssignedSlot] = useState(1);
  const assignedSlotRef = useRef(1);
  const [cameraName, setCameraName] = useState("USER");
  const [qualityProfile, setQualityProfile] = useState("auto");
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
  const directorLinkStatsRef = useRef({});
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
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [remoteTorchState, setRemoteTorchState] = useState({});
  const [selectedRemoteCameraId, setSelectedRemoteCameraId] = useState(null);
  const [operatorControlsCollapsed, setOperatorControlsCollapsed] = useState(false);
  const [operatorCommsAlert, setOperatorCommsAlert] = useState(null);
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
    document.body.classList.toggle(
      "scenepilot-viewfinder-clean",
      Boolean(showCamera && operatorControlsCollapsed)
    );

    return () => {
      document.body.classList.remove("scenepilot-viewfinder-clean");
    };
  }, [showCamera, operatorControlsCollapsed]);

  useEffect(() => {
    const handleOperatorAlert = event => {
      const detail = event.detail || {};
      if (detail.active === false) {
        setOperatorCommsAlert(current =>
          current?.type === detail.type ? null : current
        );
        return;
      }

      setOperatorCommsAlert({
        type: detail.type === "ptt" ? "ptt" : "message",
        label: detail.label || (detail.type === "ptt" ? "DIRECTOR CALLING" : "NEW MESSAGE")
      });
    };

    window.addEventListener("scenepilot:operator-alert", handleOperatorAlert);
    return () => {
      window.removeEventListener("scenepilot:operator-alert", handleOperatorAlert);
    };
  }, []);

  useEffect(() => {
    const handleGraphicsState = event => {
      if (event?.detail) graphicsStateRef.current = event.detail;
    };
    window.addEventListener("scenepilot:graphics-state", handleGraphicsState);
    return () => {
      window.removeEventListener("scenepilot:graphics-state", handleGraphicsState);
    };
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

    // A fresh Director page is a fresh production session.
    // Do not carry camera labels or main-camera choices across sessions.
    setCameraNames({});
    setDraftCameraNames({});
    setMainCamera(1);
    setPreview(1);
    setProgram(1);
    setSecondaryPreview(2);

    try {
      window.localStorage.removeItem(`scenepilot:cameraNames:${roomCode}`);
      window.localStorage.removeItem(`scenepilot:mainCamera:${roomCode}`);
    } catch (error) {
      console.warn("ScenePilot session reset could not clear saved camera setup", error);
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

    const nativeBatteryReader =
      window.Capacitor?.Plugins?.Device?.getBatteryInfo ||
      window.Capacitor?.Plugins?.Battery?.getBatteryInfo ||
      null;

    const batterySupported = Boolean(navigator.getBattery || nativeBatteryReader);
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

    const emitTelemetry = (batteryPercent, chargingValue) => {
      const network = getNetworkQuality();

      const nextTelemetry = {
        battery: batteryPercent,
        charging: chargingValue,
        network,
        batterySupported,
        networkSupported,
        status: "SHARING"
      };

      setCameraTelemetry(nextTelemetry);

      socket.emit("camera:telemetry", {
        room: roomCode,
        battery: batteryPercent,
        charging: chargingValue,
        network,
        telemetryConsent: true,
        support: {
          battery: batterySupported,
          network: networkSupported
        }
      });
    };

    const sendTelemetry = async () => {
      if (battery && Number.isFinite(battery.level)) {
        emitTelemetry(
          Math.round(battery.level * 100),
          Boolean(battery.charging)
        );
        return;
      }

      if (nativeBatteryReader) {
        try {
          const info = await nativeBatteryReader.call(
            window.Capacitor?.Plugins?.Device || window.Capacitor?.Plugins?.Battery
          );
          const rawLevel = Number(info?.batteryLevel);
          const batteryPercent = Number.isFinite(rawLevel)
            ? Math.round((rawLevel <= 1 ? rawLevel * 100 : rawLevel))
            : null;
          emitTelemetry(
            Number.isFinite(batteryPercent) ? Math.max(0, Math.min(100, batteryPercent)) : null,
            typeof info?.isCharging === "boolean" ? info.isCharging : null
          );
          return;
        } catch (error) {
          console.warn("ScenePilot native battery telemetry unavailable", error);
        }
      }

      emitTelemetry(null, null);
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
            batterySupported: Boolean(nativeBatteryReader),
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
                network: payload.network
                  ? {
                      ...(camera.network || {}),
                      ...payload.network,
                      source: payload.network.source || camera.network?.source || "device"
                    }
                  : camera.network || null,
                telemetryConsent: payload.telemetryConsent !== false,
                telemetrySupport: {
                  ...(camera.telemetrySupport || {}),
                  ...(payload.support || {})
                }
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
    if (showCamera) return;

    let cancelled = false;

    const updateLinkHealth = async () => {
      const updates = {};

      for (const camera of wirelessCameras) {
        const peer = peers.current[camera.socketId];
        if (!peer?.getStats || peer.connectionState === "closed") continue;

        try {
          const report = await peer.getStats();
          let inbound = null;
          let selectedPair = null;

          report.forEach(stat => {
            if (
              stat.type === "inbound-rtp" &&
              stat.kind === "video" &&
              !stat.isRemote
            ) {
              inbound = stat;
            }

            if (
              stat.type === "candidate-pair" &&
              stat.state === "succeeded" &&
              (stat.selected || stat.nominated)
            ) {
              selectedPair = stat;
            }
          });

          const packetsReceived = Number(inbound?.packetsReceived || 0);
          const packetsLost = Math.max(0, Number(inbound?.packetsLost || 0));
          const totalPackets = packetsReceived + packetsLost;
          const lossPct = totalPackets > 0 ? (packetsLost / totalPackets) * 100 : 0;
          const jitterMs = Number.isFinite(Number(inbound?.jitter))
            ? Number(inbound.jitter) * 1000
            : null;
          const rttMs = Number.isFinite(Number(selectedPair?.currentRoundTripTime))
            ? Number(selectedPair.currentRoundTripTime) * 1000
            : null;

          let bars = 4;
          if (
            (Number.isFinite(rttMs) && rttMs > 450) ||
            lossPct >= 8 ||
            (Number.isFinite(jitterMs) && jitterMs > 80)
          ) {
            bars = 1;
          } else if (
            (Number.isFinite(rttMs) && rttMs > 250) ||
            lossPct >= 4 ||
            (Number.isFinite(jitterMs) && jitterMs > 50)
          ) {
            bars = 2;
          } else if (
            (Number.isFinite(rttMs) && rttMs > 120) ||
            lossPct >= 1.5 ||
            (Number.isFinite(jitterMs) && jitterMs > 30)
          ) {
            bars = 3;
          }

          updates[camera.socketId] = {
            bars,
            rtt: Number.isFinite(rttMs) ? Math.round(rttMs) : null,
            jitter: Number.isFinite(jitterMs) ? Math.round(jitterMs) : null,
            lossPct: Number(lossPct.toFixed(1)),
            source: "webrtc"
          };
        } catch (error) {
          console.warn("ScenePilot link stats unavailable", camera.socketId, error);
        }
      }

      if (cancelled || !Object.keys(updates).length) return;

      directorLinkStatsRef.current = {
        ...directorLinkStatsRef.current,
        ...updates
      };

      setWirelessCameras(prev =>
        prev.map(camera => {
          const link = updates[camera.socketId];
          if (!link) return camera;
          return {
            ...camera,
            network: {
              ...(camera.network || {}),
              ...link
            },
            telemetrySupport: {
              ...(camera.telemetrySupport || {}),
              network: true
            }
          };
        })
      );
    };

    updateLinkHealth();
    const timer = window.setInterval(updateLinkHealth, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [showCamera, wirelessCameras.map(camera => camera.socketId).join("|")]);

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
      productionRecordersRef.current.forEach(recorder => {
        try {
          if (recorder?.state !== "inactive") recorder.stop();
        } catch (_) {}
      });
      productionRecordersRef.current = [];
      stopProgramCompositor();
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



  function getVideoElementForStream(key, mediaStream) {
    if (!mediaStream) return null;
    let video = programVideoElementsRef.current[key];
    if (!video) {
      video = document.createElement("video");
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      programVideoElementsRef.current[key] = video;
    }
    if (video.srcObject !== mediaStream) {
      video.srcObject = mediaStream;
      video.play?.().catch(() => {});
    }
    return video;
  }

  function sourceVideoForSlot(slotId) {
    if (slotId === DIRECTOR_SOURCE) {
      return getVideoElementForStream("director", directorStream);
    }
    const camera = wirelessCameras.find(item => item.slotId === slotId);
    if (!camera) return null;
    return getVideoElementForStream(camera.socketId, remoteStreams[camera.socketId]);
  }

  function drawVideoCover(ctx, video, x, y, width, height) {
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      ctx.fillStyle = "#181a18";
      ctx.fillRect(x, y, width, height);
      return;
    }
    const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
    const drawWidth = video.videoWidth * scale;
    const drawHeight = video.videoHeight * scale;
    const dx = x + (width - drawWidth) / 2;
    const dy = y + (height - drawHeight) / 2;
    ctx.drawImage(video, dx, dy, drawWidth, drawHeight);
  }

  function drawSourceLabel(ctx, label, x, y) {
    ctx.save();
    ctx.font = "700 18px Arial";
    ctx.textBaseline = "middle";
    const padX = 12;
    const metrics = ctx.measureText(label);
    const width = metrics.width + padX * 2;
    ctx.fillStyle = "rgba(0,0,0,.62)";
    ctx.fillRect(x, y - 18, width, 36);
    ctx.fillStyle = "#fff";
    ctx.fillText(label, x + padX, y);
    ctx.restore();
  }

  function drawProgramLayout(ctx, width, height) {
    const mode = programComposition.mode;
    const primary = programComposition.primary;
    const secondary = programComposition.secondary;

    if (mode === "split") {
      drawVideoCover(ctx, sourceVideoForSlot(primary), 0, 0, width / 2, height);
      drawVideoCover(ctx, sourceVideoForSlot(secondary), width / 2, 0, width / 2, height);
      drawSourceLabel(ctx, displayNameForCamera(primary), 18, height - 34);
      drawSourceLabel(ctx, displayNameForCamera(secondary), width / 2 + 18, height - 34);
      return;
    }

    if (mode === "pip") {
      drawVideoCover(ctx, sourceVideoForSlot(primary), 0, 0, width, height);
      const pipWidth = Math.round(width * 0.30);
      const pipHeight = Math.round(height * 0.30);
      const x = width - pipWidth - 28;
      const y = 28;
      ctx.fillStyle = "#000";
      ctx.fillRect(x - 4, y - 4, pipWidth + 8, pipHeight + 8);
      drawVideoCover(ctx, sourceVideoForSlot(secondary), x, y, pipWidth, pipHeight);
      drawSourceLabel(ctx, displayNameForCamera(secondary), x + 10, y + pipHeight - 24);
      return;
    }

    if (mode === "nine") {
      const mainWidth = Math.round(width * 0.66);
      drawVideoCover(ctx, sourceVideoForSlot(primary), 0, 0, mainWidth, height);
      drawSourceLabel(ctx, `MAIN • ${displayNameForCamera(primary)}`, 18, height - 34);

      const others = cameras.filter(camera => camera.id !== primary).slice(0, 8);
      const gridX = mainWidth;
      const gridWidth = width - mainWidth;
      const cellWidth = gridWidth / 2;
      const cellHeight = height / 4;
      others.forEach((camera, index) => {
        const col = index % 2;
        const row = Math.floor(index / 2);
        const x = gridX + col * cellWidth;
        const y = row * cellHeight;
        drawVideoCover(ctx, sourceVideoForSlot(camera.id), x, y, cellWidth, cellHeight);
        ctx.strokeStyle = "rgba(255,255,255,.18)";
        ctx.strokeRect(x, y, cellWidth, cellHeight);
      });
      return;
    }

    drawVideoCover(ctx, sourceVideoForSlot(primary), 0, 0, width, height);
  }

  function drawStandbyScreen(ctx, width, height) {
    const now = new Date();

    ctx.save();

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#111814");
    gradient.addColorStop(.52, "#18251e");
    gradient.addColorStop(1, "#0b100d");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(220,179,75,.10)";
    ctx.lineWidth = 1;
    for (let x = -height; x < width + height; x += 78) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + height, height);
      ctx.stroke();
    }

    ctx.fillStyle = "#d9ad48";
    ctx.fillRect(width / 2 - 72, height / 2 - 112, 144, 4);

    ctx.textAlign = "center";
    ctx.fillStyle = "#f3efe6";
    ctx.font = "900 18px Arial";
    ctx.letterSpacing = "4px";
    ctx.fillText("SCENEPILOT", width / 2, height / 2 - 67);

    ctx.fillStyle = "#ffffff";
    ctx.font = "900 58px Arial";
    ctx.fillText("PLEASE STAND BY", width / 2, height / 2 + 4);

    ctx.fillStyle = "#c4c9c2";
    ctx.font = "500 22px Arial";
    ctx.fillText("Live production will resume shortly", width / 2, height / 2 + 50);

    ctx.fillStyle = "rgba(255,255,255,.62)";
    ctx.font = "700 15px Arial";
    ctx.fillText(
      now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      width / 2,
      height / 2 + 94
    );

    ctx.fillStyle = "#d9ad48";
    ctx.beginPath();
    ctx.arc(width / 2 - 74, height / 2 + 91, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawGraphicsOverlay(ctx, width, height) {
    const state = graphicsStateRef.current || {};
    const graphics = state.graphics || {};
    const now = new Date();

    ctx.save();

    if (graphics.live) {
      ctx.fillStyle = "#d62828";
      ctx.fillRect(34, 28, 96, 38);
      ctx.fillStyle = "#fff";
      ctx.font = "900 20px Arial";
      ctx.fillText("LIVE", 66, 53);
    }

    if (graphics.logo) {
      const x = width - 116;
      const y = height - 108;
      ctx.fillStyle = "rgba(0,0,0,.62)";
      ctx.fillRect(x, y, 78, 54);
      ctx.fillStyle = "#fff";
      ctx.font = "900 24px Arial";
      ctx.textAlign = "center";
      ctx.fillText(graphics.logoText || "SP", x + 39, y + 35);
      ctx.textAlign = "left";
    }

    if (graphics.countdown) {
      ctx.fillStyle = "rgba(0,0,0,.68)";
      ctx.fillRect(width - 320, 28, 286, 58);
      ctx.fillStyle = "#fff";
      ctx.font = "700 16px Arial";
      ctx.fillText(graphics.countdownLabel || "COMING UP", width - 300, 49);
      const total = Math.max(0, Number(state.remaining || 0));
      const mins = Math.floor(total / 60);
      const secs = total % 60;
      ctx.font = "900 24px Arial";
      ctx.fillText(`${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`, width - 140, 64);
    }

    if (graphics.lowerThird) {
      const x = 42;
      const y = height - (graphics.ticker ? 150 : 104);
      const w = Math.min(width * .72, 850);
      ctx.fillStyle = "rgba(14,15,14,.88)";
      ctx.fillRect(x, y, w, 74);
      ctx.fillStyle = "#f0c24b";
      ctx.font = "900 16px Arial";
      ctx.fillText(graphics.headline || "COMING UP", x + 18, y + 25);
      ctx.fillStyle = "#fff";
      ctx.font = "700 22px Arial";
      ctx.fillText(graphics.subheadline || "Live coverage continues shortly", x + 18, y + 54);
    }

    if (graphics.ticker) {
      const y = height - 58;
      ctx.fillStyle = "rgba(10,10,10,.92)";
      ctx.fillRect(0, y, width, 58);
      ctx.fillStyle = "#d62828";
      ctx.fillRect(0, y, 112, 58);
      ctx.fillStyle = "#fff";
      ctx.font = "900 17px Arial";
      ctx.fillText("UPDATE", 22, y + 35);
      ctx.font = "700 18px Arial";
      const tickerText = String(graphics.tickerText || "");
      const offset = -((Date.now() / 35) % Math.max(1, width + ctx.measureText(tickerText).width));
      ctx.save();
      ctx.beginPath();
      ctx.rect(125, y, width - 250, 58);
      ctx.clip();
      ctx.fillText(tickerText, 140 + offset + width, y + 35);
      ctx.fillText(tickerText, 420 + offset + width, y + 35);
      ctx.restore();
      ctx.font = "700 16px Arial";
      ctx.fillText(now.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}), width - 110, y + 35);
    }

    ctx.restore();
  }

  function startProgramCompositor() {
    if (programCompositeStreamRef.current) return programCompositeStreamRef.current;

    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    programCanvasRef.current = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });

    const lastFrame = document.createElement("canvas");
    lastFrame.width = canvas.width;
    lastFrame.height = canvas.height;
    programLastFrameRef.current = lastFrame;

    let lastTransitionKey = programTransition.key;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;

      if (programTransition.key !== lastTransitionKey) {
        lastFrame.getContext("2d").drawImage(canvas, 0, 0);
        lastTransitionKey = programTransition.key;
        programTransitionStateRef.current = {
          key: programTransition.key,
          startedAt: performance.now(),
          duration: Number(programTransition.duration || 0),
          type: programTransition.type || "CUT"
        };
      }

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);

      if (standbyRef.current) {
        drawStandbyScreen(ctx, width, height);
      } else {
        drawProgramLayout(ctx, width, height);
        drawGraphicsOverlay(ctx, width, height);
      }

      programCompositeAudioTracksRef.current.forEach(track => {
        track.enabled = !standbyRef.current;
      });

      const tx = programTransitionStateRef.current;
      const elapsed = performance.now() - Number(tx.startedAt || 0);
      const durationMs = Math.max(0, Number(tx.duration || 0));
      if (durationMs > 0 && elapsed < durationMs && tx.type !== "CUT") {
        const progress = Math.max(0, Math.min(1, elapsed / durationMs));
        ctx.save();
        if (tx.type === "DISSOLVE") {
          ctx.globalAlpha = 1 - progress;
          ctx.drawImage(lastFrame, 0, 0);
        } else if (tx.type === "FADE") {
          const fade = progress < .5 ? progress * 2 : (1 - progress) * 2;
          ctx.globalAlpha = Math.max(0, Math.min(1, fade));
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, width, height);
        }
        ctx.restore();
      }

      programRenderFrameRef.current = requestAnimationFrame(render);
    };

    render();

    if (!canvas.captureStream) return null;
    const composite = canvas.captureStream(30);

    const sourceAudio = currentProgramMediaStream();
    const compositeAudioTracks = [];
    sourceAudio?.getAudioTracks?.().forEach(track => {
      try {
        const outputTrack = track.clone ? track.clone() : track;
        outputTrack.enabled = !standbyRef.current;
        composite.addTrack(outputTrack);
        compositeAudioTracks.push(outputTrack);
      } catch (_) {}
    });

    programCompositeAudioTracksRef.current = compositeAudioTracks;
    programCompositeStreamRef.current = composite;
    return composite;
  }

  function stopProgramCompositor() {
    if (programRenderFrameRef.current) {
      cancelAnimationFrame(programRenderFrameRef.current);
      programRenderFrameRef.current = 0;
    }
    programCompositeStreamRef.current?.getTracks?.().forEach(track => {
      if (track.kind === "video") track.stop?.();
    });
    programCompositeAudioTracksRef.current.forEach(track => {
      try { track.stop?.(); } catch (_) {}
    });
    programCompositeAudioTracksRef.current = [];
    programCompositeStreamRef.current = null;
    programCanvasRef.current = null;
    programLastFrameRef.current = null;
  }

  function chooseRecordingMimeType() {
    if (typeof MediaRecorder === "undefined") return "";
    const candidates = [
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm"
    ];
    return candidates.find(type => MediaRecorder.isTypeSupported?.(type)) || "";
  }

  function recordingExtension(mimeType = "") {
    return mimeType.includes("mp4") ? "mp4" : "webm";
  }

  function safeRecordingName(value = "camera") {
    return String(value)
      .trim()
      .replace(/[^a-z0-9-_]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "camera";
  }

  function currentProgramMediaStream() {
    const primarySlot = programComposition.primary;
    if (primarySlot === DIRECTOR_SOURCE) return directorStream || null;

    const camera = wirelessCameras.find(item => item.slotId === primarySlot);
    return camera ? remoteStreams[camera.socketId] || null : null;
  }

  function downloadRecordingBlob(blob, filename) {
    if (!blob?.size) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function createProductionRecorder(stream, label, kind) {
    if (!stream || typeof MediaRecorder === "undefined") return null;

    const mimeType = chooseRecordingMimeType();
    let recorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch (error) {
      console.error("ScenePilot production recorder unavailable", label, error);
      return null;
    }

    const chunks = [];
    const startedAt = new Date();
    recorder.ondataavailable = event => {
      if (event.data?.size) chunks.push(event.data);
    };
    recorder.onerror = error => {
      console.error("ScenePilot production recording error", label, error);
      setRecordStatus("RECORDING ERROR");
    };
    recorder.onstop = () => {
      if (!chunks.length) return;
      const type = recorder.mimeType || mimeType || chunks[0]?.type || "video/webm";
      const blob = new Blob(chunks, { type });
      const timestamp = startedAt.toISOString().replace(/[:.]/g, "-");
      const ext = recordingExtension(type);
      const filename =
        `scenepilot-${safeRecordingName(roomCode)}-${kind}-${safeRecordingName(label)}-${timestamp}.${ext}`;

      if (kind === "program") {
        if (isOwner) {
          downloadRecordingBlob(blob, filename);
          setPendingProgramMaster(current => {
            if (current?.url) URL.revokeObjectURL(current.url);
            return {
              blob,
              filename,
              url: URL.createObjectURL(blob),
              createdAt: Date.now(),
              size: blob.size,
              status: "owner"
            };
          });
          setRecordStatus("OWNER PROGRAM MASTER • DOWNLOADED + RETAINED");
          return;
        }

        setPendingProgramMaster(current => {
          if (current?.url) URL.revokeObjectURL(current.url);
          return {
            blob,
            filename,
            url: URL.createObjectURL(blob),
            createdAt: Date.now(),
            size: blob.size,
            status: "ready"
          };
        });
        setRecordStatus("PROGRAM MASTER READY • DC LIVE OR DELETE");
        return;
      }

      downloadRecordingBlob(blob, filename);
    };

    recorder.start(1000);
    productionChunksRef.current.push(chunks);
    return recorder;
  }

  function startProductionRecording() {
    if (recording) return;

    if (typeof MediaRecorder === "undefined") {
      setRecordStatus("RECORDING UNSUPPORTED");
      return;
    }

    const recorders = [];

    if (recordMode === "program" || recordMode === "both") {
      const programStream = startProgramCompositor() || currentProgramMediaStream();
      const recorder = createProductionRecorder(programStream, "program-master", "program");
      if (recorder) recorders.push(recorder);
    }

    if (recordMode === "iso" || recordMode === "both") {
      wirelessCameras.forEach(camera => {
        const cameraStream = remoteStreams[camera.socketId];
        const label = `cam-${String(camera.slotId || "x").padStart(2, "0")}-${displayNameForCamera(camera.slotId)}`;
        const recorder = createProductionRecorder(cameraStream, label, "iso");
        if (recorder) recorders.push(recorder);
      });

      if (directorStream) {
        const recorder = createProductionRecorder(
          directorStream,
          "director-cam",
          "iso"
        );
        if (recorder) recorders.push(recorder);
      }
    }

    if (!recorders.length) {
      setRecordStatus("NO LIVE STREAMS TO RECORD");
      return;
    }

    productionRecordersRef.current = recorders;
    setRecording(true);
    setRecordStatus(
      recordMode === "program"
        ? "PROGRAM RECORDING"
        : recordMode === "iso"
          ? `ISO RECORDING • ${recorders.length} FILES`
          : `PROGRAM + ISO • ${recorders.length} RECORDERS`
    );
  }

  function stopProductionRecording() {
    productionRecordersRef.current.forEach(recorder => {
      try {
        if (recorder?.state !== "inactive") recorder.stop();
      } catch (error) {
        console.warn("ScenePilot recorder stop failed", error);
      }
    });

    productionRecordersRef.current = [];
    productionChunksRef.current = [];
    stopProgramCompositor();
    setRecording(false);
    setRecordStatus(
      isOwner && (recordMode === "program" || recordMode === "both")
        ? "OWNER RECORDING SAVED • NO CUSTOMER RESTRICTIONS"
        : recordMode === "program"
          ? "PROGRAM MASTER READY • DC LIVE OR DELETE"
          : recordMode === "both"
            ? "RAW FILES SAVED • PROGRAM MASTER HELD"
            : "RAW FILES SAVED TO THIS DEVICE"
    );
  }

  function downloadPendingProgramMaster() {
    if (!isOwner || !pendingProgramMaster?.blob) return;
    downloadRecordingBlob(
      pendingProgramMaster.blob,
      pendingProgramMaster.filename || `scenepilot-${safeRecordingName(roomCode)}-owner-program.mp4`
    );
    setRecordStatus("OWNER PROGRAM MASTER DOWNLOADED");
  }

  function deletePendingProgramMaster() {
    setPendingProgramMaster(current => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
    setRecordStatus("PROGRAM MASTER DELETED");
  }

  async function publishPendingProgramMaster() {
    if (!pendingProgramMaster?.blob) {
      setRecordStatus("NO PROGRAM MASTER READY");
      return;
    }

    const DC_LIVE_API = "https://dc-live-api.ryanedavis.workers.dev";
    const blob = pendingProgramMaster.blob;
    const filename = pendingProgramMaster.filename || "scenepilot-program.webm";
    const mimeType = blob.type || (filename.toLowerCase().endsWith(".mp4") ? "video/mp4" : "video/webm");
    const defaultTitle =
      `${network?.name || user?.displayName || "ScenePilot"} • ${new Date().toLocaleString([], {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      })}`;

    setPendingProgramMaster(current =>
      current ? { ...current, status: "uploading" } : current
    );
    setRecordStatus("DC LIVE • CREATING PENDING REVIEW");

    try {
      const ticketResponse = await fetch("/api/dc-live/submission-ticket", {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" }
      });
      const ticketData = await ticketResponse.json().catch(() => ({}));
      if (!ticketResponse.ok || !ticketData.token) {
        throw new Error(ticketData.error || "Unable to authorize DC Live submission.");
      }

      const authHeaders = {
        Authorization: `Bearer ${ticketData.token}`
      };

      const submissionResponse = await fetch(`${DC_LIVE_API}/api/creator/submissions`, {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: defaultTitle,
          description: `Submitted from ScenePilot production room ${roomCode}.`,
          room: roomCode,
          filename,
          mimeType,
          requestedPriceCents: 0
        })
      });
      const submissionData = await submissionResponse.json().catch(() => ({}));
      if (!submissionResponse.ok || !submissionData.eventId) {
        throw new Error(submissionData.error || "DC Live could not create the review submission.");
      }

      const startResponse = await fetch(
        `${DC_LIVE_API}/api/creator/submissions/${encodeURIComponent(submissionData.eventId)}/upload/start`,
        {
          method: "POST",
          headers: {
            ...authHeaders,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ filename, mimeType })
        }
      );
      const startData = await startResponse.json().catch(() => ({}));
      if (!startResponse.ok || !startData.uploadId) {
        throw new Error(startData.error || "DC Live could not start the Program upload.");
      }

      const chunkSize = 8 * 1024 * 1024;
      const totalParts = Math.max(1, Math.ceil(blob.size / chunkSize));
      const parts = [];

      for (let index = 0; index < totalParts; index += 1) {
        const partNumber = index + 1;
        const start = index * chunkSize;
        const end = Math.min(blob.size, start + chunkSize);
        const chunk = blob.slice(start, end, mimeType);

        setRecordStatus(
          `DC LIVE UPLOAD • PART ${partNumber}/${totalParts} • ${Math.round((partNumber / totalParts) * 100)}%`
        );

        const partResponse = await fetch(
          `${DC_LIVE_API}/api/creator/submissions/${encodeURIComponent(submissionData.eventId)}/upload/part/${partNumber}?uploadId=${encodeURIComponent(startData.uploadId)}`,
          {
            method: "PUT",
            headers: {
              ...authHeaders,
              "Content-Type": "application/octet-stream"
            },
            body: chunk
          }
        );
        const partData = await partResponse.json().catch(() => ({}));
        if (!partResponse.ok || !partData.etag) {
          throw new Error(partData.error || `DC Live upload failed on part ${partNumber}.`);
        }

        parts.push({
          partNumber,
          etag: partData.etag
        });
      }

      const completeResponse = await fetch(
        `${DC_LIVE_API}/api/creator/submissions/${encodeURIComponent(submissionData.eventId)}/upload/complete`,
        {
          method: "POST",
          headers: {
            ...authHeaders,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            uploadId: startData.uploadId,
            parts
          })
        }
      );
      const completeData = await completeResponse.json().catch(() => ({}));
      if (!completeResponse.ok || !completeData.ok) {
        throw new Error(completeData.error || "DC Live could not finalize the Program upload.");
      }

      if (isOwner) {
        setPendingProgramMaster(current =>
          current ? { ...current, status: "submitted", submissionId: submissionData.eventId } : current
        );
      } else {
        setPendingProgramMaster(current => {
          if (current?.url) URL.revokeObjectURL(current.url);
          return null;
        });
      }

      setRecordStatus("DC LIVE • SUBMITTED • PENDING REVIEW");
    } catch (error) {
      console.error("ScenePilot DC Live submission failed", error);
      setPendingProgramMaster(current =>
        current ? { ...current, status: isOwner ? "owner" : "ready" } : current
      );
      setRecordStatus(
        `DC LIVE SUBMISSION FAILED • ${error instanceof Error ? error.message : "TRY AGAIN"}`
      );
    }
  }

  function toggleStandby() {
    const next = !standbyRef.current;
    standbyRef.current = next;
    setStandby(next);
  }

  function toggleProductionRecording() {
    if (recording) stopProductionRecording();
    else startProductionRecording();
  }

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
    setTorchSupported(Boolean(capabilities?.torch));
    setTorchOn(false);

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
    if (!videoTrack) return false;

    const capabilities = videoTrack.getCapabilities?.() || {};
    const settings = videoTrack.getSettings?.() || {};
    const liveZoomRange = capabilities.zoom;

    // Some iOS/Android browsers accept zoom constraints even when they do not
    // expose a zoom capability object. Do not bail out just because the
    // capability is missing.
    const min = Number.isFinite(liveZoomRange?.min) ? liveZoomRange.min : 1;
    const max = Number.isFinite(liveZoomRange?.max) ? liveZoomRange.max : 5;
    const step = Math.max(
      Number.isFinite(liveZoomRange?.step) ? liveZoomRange.step : 0.15,
      0.1
    );

    const reportedZoom = Number(settings.zoom);
    const current = Number.isFinite(reportedZoom)
      ? reportedZoom
      : Math.min(max, Math.max(min, zoomValueRef.current || min));

    const next = Math.min(
      max,
      Math.max(min, current + (direction * step))
    );

    if (Math.abs(next - current) < 0.0001) return true;

    const attempts = [
      { advanced: [{ zoom: next }] },
      { zoom: next },
      { advanced: [{ zoom: { ideal: next } }] }
    ];

    let lastError = null;

    for (const constraints of attempts) {
      try {
        await videoTrack.applyConstraints(constraints);

        const after = videoTrack.getSettings?.() || {};
        const actualZoom = Number(after.zoom);

        zoomValueRef.current = Number.isFinite(actualZoom)
          ? actualZoom
          : next;
        setZoomValue(zoomValueRef.current);
        setZoomRange({ min, max, step });

        return true;
      } catch (error) {
        lastError = error;
      }
    }

    console.warn("ScenePilot zoom unavailable", lastError);
    return false;
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

  async function setCameraTorch(enabled, mediaStream = stream) {
    const videoTrack = mediaStream?.getVideoTracks?.()[0];
    const capabilities = videoTrack?.getCapabilities?.();
    if (!videoTrack || !capabilities?.torch) return false;

    try {
      await videoTrack.applyConstraints({
        advanced: [{ torch: Boolean(enabled) }]
      });
      setTorchOn(Boolean(enabled));
      return true;
    } catch (error) {
      console.warn("ScenePilot camera light unavailable", error);
      return false;
    }
  }

  async function toggleCameraTorch() {
    await setCameraTorch(!torchOn);
  }

  function sendDirectorTorch(camera) {
    if (!camera?.socketId) return;
    const next = !Boolean(remoteTorchState[camera.socketId]);
    setRemoteTorchState(current => ({
      ...current,
      [camera.socketId]: next
    }));
    socket.emit("camera:control", {
      room: roomCode,
      target: camera.socketId,
      command: "torch",
      enabled: next
    });
  }

  async function flipCamera() {
    if (!stream) return;

    const nextFacing =
      facingMode === "environment" ? "user" : "environment";
    const profile = qualityProfiles[qualityProfile];
    const oldVideoTracks = stream.getVideoTracks();
    const currentVideoTrack = oldVideoTracks[0];
    const currentDeviceId = currentVideoTrack?.getSettings?.().deviceId || "";
    const audioTracks = stream.getAudioTracks();

    try {
      setSignalStatus("SWITCHING CAMERA");
      setSelectedVideoDevice("");

      const baseVideoConstraints = {
        width: { ideal: profile.width },
        height: { ideal: profile.height },
        frameRate: { ideal: profile.fps, max: profile.fps }
      };

      // Android often refuses to hand the rear camera back while the front
      // camera track is still active. Release the active lens first.
      oldVideoTracks.forEach(track => {
        try {
          track.stop();
        } catch {}
      });

      // Give Android a moment to release the camera hardware.
      await new Promise(resolve => window.setTimeout(resolve, 120));

      let replacementStream = null;
      let lastError = null;

      try {
        replacementStream = await navigator.mediaDevices.getUserMedia({
          video: {
            ...baseVideoConstraints,
            facingMode: { exact: nextFacing }
          },
          audio: false
        });
      } catch (error) {
        lastError = error;
      }

      // Fallback for Android devices that do not honor exact facingMode.
      if (!replacementStream) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter(device => device.kind === "videoinput");
          const facingWords =
            nextFacing === "environment"
              ? /back|rear|environment|world|main/i
              : /front|user|selfie|face/i;

          const preferredDevice =
            videoDevices.find(
              device =>
                device.deviceId &&
                device.deviceId !== currentDeviceId &&
                facingWords.test(device.label || "")
            ) ||
            videoDevices.find(
              device =>
                device.deviceId &&
                device.deviceId !== currentDeviceId
            );

          if (preferredDevice) {
            replacementStream = await navigator.mediaDevices.getUserMedia({
              video: {
                ...baseVideoConstraints,
                deviceId: { exact: preferredDevice.deviceId }
              },
              audio: false
            });
          }
        } catch (error) {
          lastError = error;
        }
      }

      // Last resort: ask the browser for the requested side after the old
      // hardware has already been released.
      if (!replacementStream) {
        try {
          replacementStream = await navigator.mediaDevices.getUserMedia({
            video: {
              ...baseVideoConstraints,
              facingMode: { ideal: nextFacing }
            },
            audio: false
          });
        } catch (error) {
          lastError = error;
        }
      }

      const newVideoTrack = replacementStream?.getVideoTracks?.()[0];
      if (!newVideoTrack) {
        throw lastError || new Error("No replacement camera track available");
      }

      const replaceJobs = [];

      Object.values(peers.current).forEach(peer => {
        const sender = peer
          .getSenders()
          .find(candidate => candidate.track?.kind === "video");

        if (sender) {
          replaceJobs.push(
            sender
              .replaceTrack(newVideoTrack)
              .then(() => optimizeVideoSender(sender, qualityProfile))
          );
        }
      });

      await Promise.all(replaceJobs);

      const nextStream = new MediaStream([
        newVideoTrack,
        ...audioTracks
      ]);

      const actualFacing = newVideoTrack.getSettings?.().facingMode;
      setFacingMode(
        actualFacing === "user" || actualFacing === "environment"
          ? actualFacing
          : nextFacing
      );
      setStream(nextStream);
      readZoomCapability(nextStream);
      await refreshVideoInputs();

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

async function completeCameraStartup() {
    if (!telemetryAllowed || cameraSetupBusy) return;

    setCameraSetupBusy(true);
    try {
      const connected = await enableCamera();
      if (connected) setCameraSetupOpen(false);
    } finally {
      setCameraSetupBusy(false);
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
          const sender = peer.addTrack(track, media);
          if (track.kind === "video") {
            optimizeVideoSender(sender, qualityProfile);
          }
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
        if (payload?.command === "zoom") {
          if (payload.action === "start") {
            const direction = Number(payload.direction) < 0 ? -1 : 1;
            startZoomHold(direction, media);
          } else if (payload.action === "stop") {
            stopZoomHold();
          }
          return;
        }

        if (payload?.command === "torch") {
          setCameraTorch(Boolean(payload.enabled), media);
        }
      };

      const handleConnect = () => {
        setSignalStatus("SIGNAL CONNECTED");

        socket.emit("camera:join", {
          room: roomCode,
          name: cameraName.trim() || "USER"
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
      return true;
    } catch (error) {
      setSignalStatus("CAMERA ACCESS FAILED");
      alert(`Camera access failed: ${error.message}`);
      return false;
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
      <div className={`operator-shell ${operatorControlsCollapsed ? "controls-collapsed" : ""} ${cameraSetupOpen ? "setup-active" : ""}`}>
        <header className="operator-header">
          <div>
            <span className="eyebrow">SCENEPILOT CAMERA</span>
            <h1>Camera Operator</h1>
          </div>
          <span className="room-pill">{network?.name || "SCENEPILOT NETWORK"} • ROOM {roomCode}</span>
        </header>

        {cameraSetupOpen && (
          <div className="camera-startup-gate" role="dialog" aria-modal="true" aria-label="Camera startup setup">
            <div className="camera-startup-card">
              <div className="camera-startup-brand">
                <span className="eyebrow">SCENEPILOT CAMERA</span>
                <h2>Two quick permissions</h2>
                <p>Finish these two steps before the camera operator screen opens.</p>
              </div>

              <div className={`camera-startup-step ${telemetryAllowed ? "complete" : "active"}`}>
                <div className="camera-startup-step-number">{telemetryAllowed ? "✓" : "1"}</div>
                <div className="camera-startup-step-copy">
                  <strong>ALLOW DEVICE TELEMETRY</strong>
                  <span>Share battery and network quality with the Director. Location is not requested.</span>
                </div>
                <button
                  type="button"
                  className={telemetryAllowed ? "accepted" : ""}
                  disabled={telemetryAllowed}
                  onClick={() => setTelemetryAllowed(true)}
                >
                  {telemetryAllowed ? "ACCEPTED" : "ALLOW"}
                </button>
              </div>

              <div className={`camera-startup-step ${telemetryAllowed && !stream ? "active" : ""} ${stream ? "complete" : ""}`}>
                <div className="camera-startup-step-number">{stream ? "✓" : "2"}</div>
                <div className="camera-startup-step-copy">
                  <strong>CAMERA + MICROPHONE</strong>
                  <span>Allow the phone camera and microphone so the Director can receive this feed.</span>
                </div>
                <button
                  type="button"
                  disabled={!telemetryAllowed || cameraSetupBusy || Boolean(stream)}
                  onClick={completeCameraStartup}
                >
                  {stream ? "CONNECTED" : cameraSetupBusy ? "OPENING…" : "ENABLE"}
                </button>
              </div>

              <div className="camera-startup-footer">
                <span>{telemetryAllowed ? "STEP 1 COMPLETE" : "START WITH STEP 1"}</span>
                <strong>{telemetryAllowed ? "NEXT: ENABLE CAMERA + MICROPHONE" : "2 STEPS TO JOIN"}</strong>
              </div>
            </div>
          </div>
        )}

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
                <span className={`operator-live ${isOnAir ? "on-air" : "ready"}`} role="status" aria-live="polite">
                  <i /> {isOnAir ? "LIVE" : "CONNECTED / READY"}
                </span>

                <div className={`on-air-banner ${isOnAir ? "live" : "standby"}`}>
                  {isOnAir ? (
                    <>
                      <Radio size={22}/>
                      <div>
                        <strong>LIVE — YOU ARE ON AIR</strong>
                        <span>CAMERA {String(assignedSlot).padStart(2, "0")} IS IN PROGRAM</span>
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

                <button
                  type="button"
                  className={`operator-controls-toggle ${operatorCommsAlert ? `has-alert alert-${operatorCommsAlert.type}` : ""}`}
                  onClick={() => {
                    setOperatorControlsCollapsed(value => !value);
                    if (operatorControlsCollapsed) {
                      setOperatorCommsAlert(null);
                      window.dispatchEvent(new CustomEvent("scenepilot:operator-alert-cleared"));
                    }
                  }}
                  aria-pressed={operatorControlsCollapsed}
                  title={operatorControlsCollapsed ? "Show camera controls" : "Hide camera controls"}
                >
                  {operatorControlsCollapsed ? <Maximize size={17}/> : <Minimize2 size={17}/>}
                  <span>
                    {operatorControlsCollapsed && operatorCommsAlert?.type === "ptt"
                      ? "DIRECTOR CALLING"
                      : operatorControlsCollapsed && operatorCommsAlert?.type === "message"
                        ? "NEW MESSAGE"
                        : operatorControlsCollapsed
                          ? "SHOW CONTROLS"
                          : "HIDE CONTROLS"}
                  </span>
                  {operatorControlsCollapsed && operatorCommsAlert && (
                    <i className="operator-alert-dot" aria-hidden="true"/>
                  )}
                </button>

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
                    className={`camera-control-button light-control ${torchOn ? "active" : ""}`}
                    onClick={toggleCameraTorch}
                    disabled={!torchSupported}
                    title={torchSupported ? "Turn camera light on or off" : "Camera light is unavailable on this device/browser"}
                  >
                    <Flashlight size={24}/>
                    <span>{torchOn ? "LIGHT ON" : "CAMERA LIGHT"}</span>
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
    if (camera.telemetrySupport?.network === false && !camera.network) return "WAITING";

    const bars = camera.network?.bars;
    if (bars === 4) return "EXCELLENT";
    if (bars === 3) return "GOOD";
    if (bars === 2) return "FAIR";
    if (bars === 1) return "WEAK";
    return camera.network ? "LIMITED" : "CHECKING";
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

    return `USER ${String(slotId).padStart(2, "0")}`;
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
              <div className="program-head-status">
                <span className={`program-live-status ${standby ? "standby" : "live"}`}>
                  <i/> {standby ? "PROGRAM STANDBY" : "PROGRAM LIVE"}
                </span>
                <strong>PGM</strong>
              </div>
            </div>
            <div
              key={`program-${programTransition.key}`}
              className={`screen program-screen transition-${programTransition.type.toLowerCase()}`}
              style={{ "--transition-duration": `${programTransition.duration}ms` }}
            >
              {standby ? (
                <div className="program-standby-screen" role="status" aria-label="Program is on standby">
                  <div className="program-standby-grid"/>
                  <div className="program-standby-content">
                    <span className="program-standby-brand">SCENEPILOT</span>
                    <i/>
                    <strong>PLEASE STAND BY</strong>
                    <small>Live production will resume shortly</small>
                  </div>
                </div>
              ) : instantReplayMode === "program" && instantReplayUrl ? (
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
              <span className="source-tag">
                {standby
                  ? "HOLD SCREEN • PROGRAM PAUSED"
                  : instantReplayMode === "program"
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

          <div className="source-feature-row">
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

            <div className="take-standby-row">
              <button className="take-button" onClick={take}>
                <span>TAKE</span>
                <small>{transition} • {duration}ms</small>
              </button>

              <button
                type="button"
                className={`standby-button ${standby ? "active" : ""}`}
                onClick={toggleStandby}
              >
                <span>{standby ? "RETURN TO PROGRAM" : "STANDBY / HOLD"}</span>
                <small>{standby ? "Audience returns live" : "Keep stream live • mute program"}</small>
              </button>
            </div>
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
              <strong>SELECT CAMERA</strong>
              <span>TAP A CAMERA FOR LARGE CONTROLS</span>
            </div>

            <div className="remote-camera-control-grid remote-camera-selector-grid">
              {wirelessCameras.length ? wirelessCameras.map(camera => (
                <button
                  type="button"
                  className="remote-camera-select-card"
                  key={camera.socketId}
                  onClick={() => setSelectedRemoteCameraId(camera.socketId)}
                >
                  <span className="remote-camera-select-copy">
                    <strong>{displayNameForCamera(camera.slotId)}</strong>
                    <small>CAM {String(camera.slotId || "?").padStart(2, "0")}</small>
                  </span>
                  <span className="remote-camera-select-action">OPEN CONTROLS</span>
                </button>
              )) : (
                <div className="remote-camera-control-empty">
                  Connect a wireless camera to expose director controls.
                </div>
              )}
            </div>

            {selectedRemoteCameraId && (() => {
              const camera = wirelessCameras.find(
                item => item.socketId === selectedRemoteCameraId
              );

              if (!camera) return null;

              return (
                <div
                  className="remote-camera-control-popout"
                  role="dialog"
                  aria-label={`Remote controls for ${displayNameForCamera(camera.slotId)}`}
                >
                  <div className="remote-camera-popout-head">
                    <div>
                      <span>REMOTE CAMERA</span>
                      <strong>{displayNameForCamera(camera.slotId)}</strong>
                      <small>CAM {String(camera.slotId || "?").padStart(2, "0")}</small>
                    </div>
                    <button
                      type="button"
                      className="remote-camera-popout-close"
                      onClick={() => setSelectedRemoteCameraId(null)}
                      aria-label="Close remote camera controls"
                    >
                      <X size={20}/>
                    </button>
                  </div>

                  <div className="remote-camera-popout-controls">
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
                    >
                      <ZoomOut size={24}/>
                      <strong>ZOOM OUT</strong>
                      <span>HOLD</span>
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
                    >
                      <ZoomIn size={24}/>
                      <strong>ZOOM IN</strong>
                      <span>HOLD</span>
                    </button>

                    <button
                      type="button"
                      className={remoteTorchState[camera.socketId] ? "light-active" : ""}
                      onClick={() => sendDirectorTorch(camera)}
                    >
                      <Flashlight size={24}/>
                      <strong>{remoteTorchState[camera.socketId] ? "LIGHT ON" : "LIGHT"}</strong>
                      <span>TOGGLE</span>
                    </button>
                  </div>
                </div>
              );
            })()}
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
            <div className="panel-label">LOCAL RECORDING</div>

            <div className="record-mode-grid" role="group" aria-label="Recording mode">
              <button
                type="button"
                className={recordMode === "program" ? "active" : ""}
                disabled={recording}
                onClick={() => setRecordMode("program")}
              >
                <strong>PROGRAM</strong>
                <small>Finished live source</small>
              </button>
              <button
                type="button"
                className={recordMode === "iso" ? "active" : ""}
                disabled={recording}
                onClick={() => setRecordMode("iso")}
              >
                <strong>ALL CAMERAS / ISO</strong>
                <small>Separate camera files</small>
              </button>
              <button
                type="button"
                className={recordMode === "both" ? "active" : ""}
                disabled={recording}
                onClick={() => setRecordMode("both")}
              >
                <strong>BOTH</strong>
                <small>Program + every camera</small>
              </button>
            </div>

            <button
              className={`record-button ${recording ? "recording" : ""}`}
              onClick={toggleProductionRecording}
            >
              <Circle size={19} fill="currentColor"/>
              {recording ? "STOP & SAVE RECORDING" : "START RECORDING"}
            </button>

            <div className="record-status-line">
              <i className={recording ? "live" : ""}/>
              <strong>{recordStatus}</strong>
            </div>

            <div className="output-data">
              <span>{recordMode === "program" ? "PROGRAM" : recordMode === "iso" ? "ISO TRACKS" : "PROGRAM + ISO"}</span>
              <span>{recordMode === "iso" ? "RAW • DOWNLOADABLE" : "PROGRAM • PROTECTED"}</span>
            </div>

            {pendingProgramMaster && (
              <div className={`program-master-policy ${isOwner ? "owner" : ""}`}>
                <div>
                  <strong>{isOwner ? "ICA OWNER PROGRAM MASTER" : "FINISHED PROGRAM MASTER"}</strong>
                  <small>
                    {isOwner
                      ? "Owner exemption active: download, keep, publish or delete this Program with no customer retention or monetization restriction."
                      : "This composed production is not downloadable. Raw ISO camera files remain yours to download."}
                  </small>
                </div>
                <div className="program-master-actions">
                  {isOwner && (
                    <button
                      type="button"
                      className="program-download"
                      onClick={downloadPendingProgramMaster}
                    >
                      DOWNLOAD MASTER
                    </button>
                  )}
                  <button
                    type="button"
                    className="program-delete"
                    onClick={deletePendingProgramMaster}
                  >
                    DELETE PROGRAM
                  </button>
                  <button
                    type="button"
                    className="program-publish"
                    onClick={publishPendingProgramMaster}
                    disabled={pendingProgramMaster.status === "uploading" || pendingProgramMaster.status === "submitted"}
                  >
                    {pendingProgramMaster.status === "uploading"
                      ? "UPLOADING TO DC LIVE…"
                      : pendingProgramMaster.status === "submitted"
                        ? "PENDING REVIEW"
                        : "PUBLISH TO DC LIVE"}
                  </button>
                </div>
              </div>
            )}

            <p className="record-help">
              {isOwner
                ? "ICA Owner mode has no customer recording restrictions: raw files and finished Program masters can be downloaded, retained, published, archived or deleted at your discretion."
                : "Raw ISO camera files can be downloaded and kept by the creator. The finished Program master includes the composed production, graphics, transitions and overlays, so it stays inside the ScenePilot / DC Live ecosystem: publish it to DC Live or delete it."}
            </p>
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
        <BroadcastPanel
          roomCode={roomCode}
          getProgramStream={() => startProgramCompositor() || currentProgramMediaStream()}
        />
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
              <p><strong>11. Camera phones:</strong> Connected phones can use flip, press-and-hold smooth zoom, camera light/torch when the browser exposes it, Live Shield, telemetry, and camera communications. The Director can remotely hold zoom and toggle the camera light on supported devices.</p>
              <p><strong>12. Standby / Hold:</strong> Press STANDBY / HOLD to immediately replace Program with the built-in PLEASE STAND BY screen while the production stays connected. Program audio is muted on the composed output until RETURN TO PROGRAM is pressed.</p>
              <p><strong>13. Instant Replay:</strong> ScenePilot keeps the Program source buffered for replay when browser MediaRecorder support is available. Replay returns to the live Program automatically when it ends.</p>
              <p><strong>14. If a feed drops:</strong> Leave the camera page open while ScenePilot reconnects. The Multiview tile resumes from the same source slot when its WebRTC stream returns.</p>
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
