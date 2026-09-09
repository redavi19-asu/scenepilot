import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Radio, LogIn, UserPlus, Download, LockKeyhole, MessageSquare,
  Send, ShieldCheck, Users, ArrowRight, LogOut, Crown, Mail,
  X, Camera, RadioTower, Mic, Headphones, Cast, Maximize2
} from "lucide-react";
import App from "./App.jsx";
import TurnstileWidget from "./TurnstileWidget.jsx";
import { socket } from "./socket";
import "./ScenePilotPortal.css";

function WatchPage({ roomCode }) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState("CONNECTING TO LIVE PROGRAM");
  const [tvStatus, setTvStatus] = useState("");
  const safeRoom = String(roomCode || "").replace(/[^A-Za-z0-9_-]/g, "");
  const streamUrl = `https://live.icomputeranything.com/hls/live/${encodeURIComponent(safeRoom)}/index.m3u8`;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !safeRoom) return undefined;

    let hls = null;
    let cancelled = false;

    const seekToLiveEdge = () => {
      if (!video.seekable?.length) return;
      const liveEdge = video.seekable.end(video.seekable.length - 1);
      if (!Number.isFinite(liveEdge)) return;
      const target = Math.max(0, liveEdge - 0.65);
      if (!Number.isFinite(video.currentTime) || liveEdge - video.currentTime > 2.25) {
        try {
          video.currentTime = target;
        } catch (_) {}
      }
    };

    const markLive = () => setStatus("LIVE");
    const catchUpToLive = () => {
      if (!video.seekable?.length || video.paused) return;
      const liveEdge = video.seekable.end(video.seekable.length - 1);
      const latency = liveEdge - video.currentTime;

      if (latency > 4.5) {
        seekToLiveEdge();
        video.playbackRate = 1;
      } else if (latency > 2.25) {
        video.playbackRate = 1.08;
      } else if (video.playbackRate !== 1) {
        video.playbackRate = 1;
      }
    };

    video.addEventListener("playing", markLive);
    video.addEventListener("loadedmetadata", seekToLiveEdge);
    video.addEventListener("canplay", seekToLiveEdge);
    video.addEventListener("timeupdate", catchUpToLive);

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = streamUrl;
      video.load();
      video.play().catch(() => {});
    } else {
      import("hls.js").then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) {
          setStatus("LIVE VIDEO IS NOT SUPPORTED IN THIS BROWSER");
          return;
        }

        hls = new Hls({
          lowLatencyMode: true,
          liveSyncDurationCount: 1,
          liveMaxLatencyDurationCount: 3,
          maxLiveSyncPlaybackRate: 1.2,
          backBufferLength: 15,
          maxBufferLength: 8,
          enableWorker: true
        });
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setStatus("LIVE PROGRAM READY");
          const syncPosition = hls.liveSyncPosition;
          if (Number.isFinite(syncPosition)) {
            try {
              video.currentTime = syncPosition;
            } catch (_) {}
          } else {
            seekToLiveEdge();
          }
          video.play().catch(() => {});
        });
        hls.on(Hls.Events.LEVEL_UPDATED, seekToLiveEdge);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          setStatus("WAITING FOR THE LIVE PROGRAM");
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        });
      }).catch(() => setStatus("LIVE PLAYER COULD NOT LOAD"));
    }

    return () => {
      cancelled = true;
      video.removeEventListener("playing", markLive);
      video.removeEventListener("loadedmetadata", seekToLiveEdge);
      video.removeEventListener("canplay", seekToLiveEdge);
      video.removeEventListener("timeupdate", catchUpToLive);
      hls?.destroy();
      video.pause?.();
      video.removeAttribute("src");
      video.load();
    };
  }, [safeRoom, streamUrl]);

  async function openTvPicker() {
    const video = videoRef.current;
    if (!video) return;

    setTvStatus("");

    try {
      if (typeof video.webkitShowPlaybackTargetPicker === "function") {
        video.webkitShowPlaybackTargetPicker();
        setTvStatus("CHOOSE AN AIRPLAY TV OR DISPLAY");
        return;
      }

      if (video.remote && typeof video.remote.prompt === "function") {
        await video.remote.prompt();
        setTvStatus("CHOOSE A TV OR REMOTE DISPLAY");
        return;
      }

      setTvStatus("USE YOUR BROWSER CAST / AIRPLAY MENU FOR THIS DEVICE");
    } catch (error) {
      console.warn("ScenePilot TV playback picker unavailable", error);
      setTvStatus("TV CONNECTION CANCELLED OR NOT AVAILABLE");
    }
  }

  async function openFullscreen() {
    const video = videoRef.current;
    const container = video?.closest(".sp-watch-video");
    if (!video) return;

    try {
      if (typeof video.requestFullscreen === "function") {
        await video.requestFullscreen();
        return;
      }

      if (typeof video.webkitEnterFullscreen === "function") {
        video.webkitEnterFullscreen();
        return;
      }

      if (typeof video.webkitRequestFullscreen === "function") {
        video.webkitRequestFullscreen();
        return;
      }

      if (typeof container?.requestFullscreen === "function") {
        await container.requestFullscreen();
        return;
      }

      if (typeof container?.webkitRequestFullscreen === "function") {
        container.webkitRequestFullscreen();
        return;
      }

      setTvStatus("FULLSCREEN IS NOT AVAILABLE IN THIS BROWSER");
    } catch (error) {
      console.warn("ScenePilot fullscreen unavailable", error);

      try {
        if (typeof video.webkitEnterFullscreen === "function") {
          video.webkitEnterFullscreen();
          return;
        }
      } catch (_) {}

      setTvStatus("FULLSCREEN COULD NOT START");
    }
  }

  return (
    <main className="sp-watch-shell">
      <section className="sp-watch-card">
        <div className="sp-watch-brand"><RadioTower size={20}/> SCENEPILOT LIVE</div>
        <div className="sp-watch-video">
          <video
            ref={videoRef}
            controls
            autoPlay
            playsInline
            x-webkit-airplay="allow"
            aria-label={`ScenePilot live room ${safeRoom}`}
          />
          <div className="sp-watch-video-actions">
            <button type="button" onClick={openTvPicker} title="Play on TV / AirPlay / Cast">
              <Cast size={20}/>
              <span>TV</span>
            </button>
            <button type="button" onClick={openFullscreen} title="Fullscreen">
              <Maximize2 size={20}/>
              <span>FULL</span>
            </button>
          </div>
        </div>
        <div className="sp-watch-status">
          <i className={status === "LIVE" ? "live" : ""}/>
          <strong>{status}</strong>
          {tvStatus && <small>{tvStatus}</small>}
          <span>ROOM {safeRoom}</span>
        </div>
      </section>
    </main>
  );
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  let data = null;
  let rawText = "";

  try {
    rawText = await response.text();
    data = rawText ? JSON.parse(rawText) : {};
  } catch (_) {
    data = {
      error:
        response.ok
          ? "ScenePilot returned an unreadable response."
          : `ScenePilot account service failed (HTTP ${response.status}).`
    };
  }

  if (!response.ok) {
    const message = [
      data?.error || "Request failed.",
      data?.detail ? `Details: ${data.detail}` : ""
    ].filter(Boolean).join(" ");

    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

function go(path) {
  window.location.assign(path);
}

function LandingPage() {
  return (
    <div className="sp-landing">
      <header className="sp-landing-nav">
        <div className="sp-landing-brand">
          <span className="sp-landing-mark"><Radio size={24}/></span>
          <div>
            <strong>SCENEPILOT</strong>
            <small>BY I COMPUTER ANYTHING</small>
          </div>
        </div>

        <div className="sp-nav-account-actions">
          <button className="sp-nav-create" onClick={() => go("/register")}>
            <UserPlus size={17}/> CREATE ACCOUNT
          </button>
          <button className="sp-nav-login" onClick={() => go("/app")}>
            <LogIn size={17}/> LOGIN
          </button>
        </div>
      </header>

      <main>
        <section className="sp-hero">
          <div className="sp-hero-copy">
            <span className="sp-kicker">LIVE PRODUCTION • PHONES • CAMERAS • EVENTS</span>
            <h1>Your production switcher can fit in a browser.</h1>
            <p>
              ScenePilot turns phones, tablets, capture devices and computers into a
              coordinated live-production system with a dedicated Director and wireless
              camera operators.
            </p>

            <div className="sp-hero-actions">
              <button className="sp-primary" onClick={() => go("/app")}>
                <LogIn size={18}/> LOGIN
              </button>
              <button className="sp-secondary" onClick={() => go("/register")}>
                <UserPlus size={18}/> CREATE ACCOUNT
              </button>
              <button className="sp-secondary" disabled title="Desktop download will unlock after release packaging is complete.">
                <Download size={18}/> DOWNLOAD — COMING SOON
              </button>
            </div>

            <div className="sp-beta-note">
              <ShieldCheck size={17}/>
              <span>Create an account to request beta access. Director access is granted separately by the ScenePilot administrator.</span>
            </div>
          </div>

          <div className="sp-hero-console">
            <div className="sp-console-top">
              <span><i/> DIRECTOR ONLINE</span>
              <span>ROOM SP-4827</span>
            </div>
            <div className="sp-console-screens">
              <div><Camera size={34}/><strong>PREVIEW</strong><small>CAM 07</small></div>
              <div><RadioTower size={34}/><strong>PROGRAM</strong><small>LIVE</small></div>
            </div>
            <div className="sp-console-cams">
              {[1,2,3,4,5,6].map(cam => <span key={cam}>CAM {String(cam).padStart(2,"0")}</span>)}
            </div>
          </div>
        </section>

        <section className="sp-feature-strip">
          <article>
            <Users size={22}/>
            <strong>ONE DIRECTOR</strong>
            <p>One authorized Director controls the room. QR-code users join as camera operators only.</p>
          </article>
          <article>
            <MessageSquare size={22}/>
            <strong>OPERATOR COMMS</strong>
            <p>Camera operators can text the Director when a loud venue makes voice communication difficult.</p>
          </article>
          <article>
            <LockKeyhole size={22}/>
            <strong>ICA ACCOUNT</strong>
            <p>Your login is designed to become one account for ScenePilot and future I Computer Anything SaaS products.</p>
          </article>
        </section>

        <section className="sp-plans">
          <div>
            <span className="sp-kicker">EARLY ACCESS</span>
            <h2>Get the account system in place now. Billing comes next.</h2>
            <p>
              Stripe purchasing and desktop downloads are intentionally disabled until
              the commercial release flow is connected.
            </p>
          </div>
          <button className="sp-disabled-pay" disabled>
            STRIPE CHECKOUT — COMING SOON
          </button>
        </section>
      </main>

      <footer className="sp-landing-footer">
        <span>ScenePilot</span>
        <span>Built by I Computer Anything</span>
      </footer>
    </div>
  );
}

function AuthPanel({ onAuthenticated, initialMode = "login" }) {
  const [mode, setMode] = useState(initialMode);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [marketing, setMarketing] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  const handleTurnstileToken = useCallback(token => {
    setTurnstileToken(token || "");
    if (token) setStatus("");
  }, []);

  async function submit(event) {
    event.preventDefault();
    setStatus("");

    if (!turnstileToken) {
      setStatus("Complete the Cloudflare security check before continuing.");
      return;
    }

    setBusy(true);

    try {
      const payload = mode === "register"
        ? {
            displayName,
            email,
            password,
            marketingOptIn: marketing,
            turnstileToken
          }
        : {
            email,
            password,
            turnstileToken
          };

      const data = await api(
        mode === "register" ? "/api/auth/register" : "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify(payload)
        }
      );

      if (mode === "register" && data.pendingApproval) {
        setStatus("ACCOUNT CREATED — WAITING FOR BETA APPROVAL. You can log in after the ScenePilot administrator activates your access.");
        setMode("login");
        setPassword("");
        setTurnstileToken("");
        setTurnstileResetKey(value => value + 1);
        return;
      }

      onAuthenticated(data.user);
    } catch (error) {
      setStatus(error.message);
      setTurnstileToken("");
      setTurnstileResetKey(value => value + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sp-auth-shell">
      <button className="sp-auth-back" onClick={() => go("/")}>← ScenePilot home</button>
      <div className="sp-auth-card">
        <div className="sp-auth-logo"><Radio size={26}/></div>
        <span className="sp-kicker">ICA SOFTWARE ACCOUNT</span>
        <h1>{mode === "register" ? "Create your account." : "Welcome back."}</h1>
        <p>
          {mode === "register"
            ? "Create your ICA Software account to request ScenePilot beta access. Registration does not unlock the Director console until an administrator approves you."
            : "Sign in to open the Director console after your ScenePilot access has been activated."}
        </p>

        <div className="sp-auth-mode-switch">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setStatus(""); setTurnstileToken(""); setTurnstileResetKey(value => value + 1); }}>
            LOGIN
          </button>
          <button type="button" className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setStatus(""); setTurnstileToken(""); setTurnstileResetKey(value => value + 1); }}>
            CREATE ACCOUNT
          </button>
        </div>

        <form onSubmit={submit}>
          {mode === "register" && (
            <label>
              NAME
              <input
                type="text"
                value={displayName}
                onChange={event => setDisplayName(event.target.value)}
                autoComplete="name"
                required
              />
            </label>
          )}

          <label>
            EMAIL
            <input
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label>
            PASSWORD
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              minLength={8}
              required
            />
          </label>

          {mode === "register" && (
            <label className="sp-marketing-opt">
              <input
                type="checkbox"
                checked={marketing}
                onChange={event => setMarketing(event.target.checked)}
              />
              <span>Optional: Email me ScenePilot and ICA product updates, feature announcements, and occasional offers.</span>
            </label>
          )}

          <TurnstileWidget
            action={mode === "register" ? "register" : "login"}
            onToken={handleTurnstileToken}
            resetKey={turnstileResetKey}
          />

          {status && <div className="sp-auth-error">{status}</div>}

          <button className="sp-auth-submit" disabled={busy || !turnstileToken}>
            {mode === "register" ? <UserPlus size={17}/> : <LogIn size={17}/>}
            {busy ? "PLEASE WAIT..." : mode === "register" ? "CREATE ACCOUNT" : "LOGIN"}
          </button>
        </form>
      </div>
    </div>
  );
}

function AccountBar({ user, onLogout }) {
  return (
    <div className="sp-account-bar">
      <div>
        {user.role === "owner" ? <Crown size={15}/> : <ShieldCheck size={15}/>}
        <span>{user.displayName || user.email}</span>
        <small>{String(user.plan || "beta").toUpperCase()}</small>
      </div>
      {(user.role === "owner" || user.role === "admin") && (
        <button onClick={() => go("/admin")}>ADMIN</button>
      )}
      <button onClick={onLogout}><LogOut size={14}/> LOGOUT</button>
    </div>
  );
}

function IntercomPanel({ mode }) {
  const roomCode = new URLSearchParams(window.location.search).get("room") || "SP-4827";
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState([]);
  const [targetId, setTargetId] = useState("");
  const [directorId, setDirectorId] = useState("");
  const [enabled, setEnabled] = useState(mode === "director");
  const [talking, setTalking] = useState(false);
  const [incomingPtt, setIncomingPtt] = useState(null);
  const [status, setStatus] = useState(mode === "director" ? "READY" : "INTERCOM OFF");
  const peersRef = useRef({});
  const pendingIceRef = useRef({});
  const micStreamRef = useRef(null);
  const audioElementsRef = useRef({});
  const talkingTargetsRef = useRef([]);
  const talkingSignalTargetRef = useRef(null);

  useEffect(() => {
    const openFromMenu = () => setOpen(true);
    window.addEventListener("scenepilot:open-intercom", openFromMenu);
    return () => window.removeEventListener("scenepilot:open-intercom", openFromMenu);
  }, []);

  const ensureMic = useCallback(async () => {
    const existing = micStreamRef.current;
    if (existing?.getAudioTracks?.().some(track => track.readyState === "live")) {
      return existing;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone access is not supported on this device.");
    }

    const media = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    media.getAudioTracks().forEach(track => {
      track.enabled = false;
    });

    micStreamRef.current = media;
    return media;
  }, []);

  const attachRemoteAudio = useCallback((peerId, stream) => {
    let element = audioElementsRef.current[peerId];

    if (!element) {
      element = new Audio();
      element.autoplay = true;
      element.playsInline = true;
      audioElementsRef.current[peerId] = element;
    }

    if (element.srcObject !== stream) {
      element.srcObject = stream;
    }

    element.volume = 1;
    element.muted = false;
    element.play?.().catch(() => {
      setStatus("TAP INTERCOM TO ENABLE AUDIO");
    });
  }, []);

  const flushIce = useCallback(async peerId => {
    const peerState = peersRef.current[peerId];
    const peer = peerState?.peer;
    if (!peer?.remoteDescription) return;

    const queued = pendingIceRef.current[peerId] || [];
    delete pendingIceRef.current[peerId];

    for (const candidate of queued) {
      try {
        await peer.addIceCandidate(candidate);
      } catch (error) {
        console.warn("ScenePilot intercom queued ICE error", error);
      }
    }
  }, []);

  const buildPeer = useCallback(peerId => {
    const current = peersRef.current[peerId];
    if (
      current?.peer &&
      !["closed", "failed"].includes(current.peer.connectionState)
    ) {
      return current;
    }

    try {
      current?.peer?.close?.();
    } catch (_) {}

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

    const transceiver = peer.addTransceiver("audio", {
      direction: "sendrecv"
    });

    const peerState = {
      peer,
      sender: transceiver.sender,
      sendTrack: null,
      offered: false
    };

    peersRef.current[peerId] = peerState;

    peer.onicecandidate = event => {
      if (!event.candidate) return;
      socket.emit("intercom:ice", {
        target: peerId,
        candidate: event.candidate
      });
    };

    peer.ontrack = event => {
      const incoming =
        event.streams?.[0] ||
        new MediaStream([event.track]);

      attachRemoteAudio(peerId, incoming);
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") {
        setStatus("INTERCOM CONNECTED");
      } else if (peer.connectionState === "connecting") {
        setStatus("INTERCOM CONNECTING");
      } else if (peer.connectionState === "failed") {
        setStatus("INTERCOM RETRY NEEDED");
      }
    };

    return peerState;
  }, [attachRemoteAudio]);

  const attachMicToPeer = useCallback(async peerId => {
    const media = await ensureMic();
    const sourceTrack = media.getAudioTracks()[0];
    if (!sourceTrack) throw new Error("No microphone track is available.");

    const peerState = buildPeer(peerId);

    if (!peerState.sendTrack || peerState.sendTrack.readyState === "ended") {
      peerState.sendTrack = sourceTrack.clone();
      peerState.sendTrack.enabled = false;
      await peerState.sender.replaceTrack(peerState.sendTrack);
    }

    return peerState;
  }, [buildPeer, ensureMic]);

  const ensurePeer = useCallback(async (peerId, initiate = false) => {
    if (!peerId) return null;

    const peerState = buildPeer(peerId);

    if (
      initiate &&
      !peerState.offered &&
      peerState.peer.signalingState === "stable"
    ) {
      peerState.offered = true;

      const offer = await peerState.peer.createOffer();
      await peerState.peer.setLocalDescription(offer);

      socket.emit("intercom:offer", {
        target: peerId,
        offer: peerState.peer.localDescription
      });
    }

    return peerState;
  }, [buildPeer]);

  const enableCameraIntercom = useCallback(async () => {
    if (mode !== "camera") return;

    try {
      setStatus("REQUESTING MICROPHONE");
      await ensureMic();
      setEnabled(true);
      setStatus(directorId ? "INTERCOM READY" : "WAITING FOR DIRECTOR");

      if (directorId) {
        await ensurePeer(directorId, true);
        await attachMicToPeer(directorId);
      }
    } catch (error) {
      setStatus("MICROPHONE BLOCKED");
      console.error("ScenePilot intercom microphone error", error);
    }
  }, [mode, ensureMic, directorId, ensurePeer, attachMicToPeer]);

  const beginTalk = useCallback(async event => {
    event?.preventDefault?.();
    event?.currentTarget?.setPointerCapture?.(event.pointerId);

    if (!socket.connected || talking) return;

    try {
      if (mode === "camera" && !enabled) {
        await enableCameraIntercom();
      }

      const ids =
        mode === "director"
          ? (targetId ? [targetId] : targets.map(camera => camera.socketId))
          : (directorId ? [directorId] : []);

      if (!ids.length) {
        setStatus(mode === "director" ? "NO CAMERAS CONNECTED" : "DIRECTOR OFFLINE");
        return;
      }

      await ensureMic();

      for (const id of ids) {
        await ensurePeer(id, true);
        const peerState = await attachMicToPeer(id);
        peerState.sendTrack.enabled = true;
      }

      talkingTargetsRef.current = ids;
      talkingSignalTargetRef.current =
        mode === "director" ? (targetId || null) : directorId;

      socket.emit("intercom:ptt", {
        room: roomCode,
        target: talkingSignalTargetRef.current,
        active: true
      });

      setTalking(true);
      setStatus("TRANSMITTING");
    } catch (error) {
      setTalking(false);
      setStatus("INTERCOM ERROR");
      console.error("ScenePilot intercom transmit error", error);
    }
  }, [
    talking,
    mode,
    enabled,
    enableCameraIntercom,
    targetId,
    targets,
    directorId,
    ensureMic,
    ensurePeer,
    attachMicToPeer,
    roomCode
  ]);

  useEffect(() => {
    if (mode !== "director") return;
    window.dispatchEvent(new CustomEvent("scenepilot:secondary-tool-alert", {
      detail: {
        type: "intercom",
        active: Boolean(incomingPtt),
        label: incomingPtt ? "WALKIE-TALKIE" : ""
      }
    }));
  }, [incomingPtt, mode]);

  const endTalk = useCallback(event => {
    event?.preventDefault?.();

    talkingTargetsRef.current.forEach(id => {
      const track = peersRef.current[id]?.sendTrack;
      if (track) track.enabled = false;
    });

    if (talking || talkingTargetsRef.current.length) {
      socket.emit("intercom:ptt", {
        room: roomCode,
        target: talkingSignalTargetRef.current,
        active: false
      });
    }

    talkingTargetsRef.current = [];
    talkingSignalTargetRef.current = null;
    setTalking(false);
    setStatus(enabled ? "INTERCOM READY" : "INTERCOM OFF");
  }, [talking, roomCode, enabled]);

  useEffect(() => {
    const handleRoomCameras = cameras => {
      if (mode !== "director") return;

      setTargets(cameras || []);
      setTargetId(current => {
        if (
          current &&
          (cameras || []).some(camera => camera.socketId === current)
        ) {
          return current;
        }
        return "";
      });
    };

    const handleCameraJoined = camera => {
      if (mode !== "director") return;

      setTargets(current => {
        const rest = current.filter(item => item.socketId !== camera.socketId);
        return [...rest, camera];
      });
    };

    const handleCameraLeft = ({ socketId }) => {
      if (mode !== "director") return;

      setTargets(current =>
        current.filter(camera => camera.socketId !== socketId)
      );
      setTargetId(current => current === socketId ? "" : current);

      const peerState = peersRef.current[socketId];
      try {
        peerState?.peer?.close?.();
        peerState?.sendTrack?.stop?.();
      } catch (_) {}
      delete peersRef.current[socketId];
    };

    const handleDirector = ({ directorId: nextDirectorId } = {}) => {
      if (mode !== "camera") return;

      setDirectorId(nextDirectorId || "");
      setStatus(
        nextDirectorId
          ? (enabled ? "INTERCOM READY" : "DIRECTOR AVAILABLE")
          : "WAITING FOR DIRECTOR"
      );
    };

    const handleOffer = async ({ from, offer }) => {
      if (!from || !offer) return;

      try {
        const peerState = buildPeer(from);

        if (peerState.peer.signalingState !== "stable") {
          await peerState.peer.setLocalDescription({ type: "rollback" }).catch(() => {});
        }

        await peerState.peer.setRemoteDescription(offer);
        await flushIce(from);

        const answer = await peerState.peer.createAnswer();
        await peerState.peer.setLocalDescription(answer);

        socket.emit("intercom:answer", {
          target: from,
          answer: peerState.peer.localDescription
        });

        if (mode === "camera" && enabled) {
          await attachMicToPeer(from);
        }

        setStatus("INTERCOM CONNECTING");
      } catch (error) {
        console.error("ScenePilot intercom offer error", error);
        setStatus("INTERCOM ERROR");
      }
    };

    const handleAnswer = async ({ from, answer }) => {
      const peerState = peersRef.current[from];
      if (!peerState?.peer || !answer) return;

      try {
        await peerState.peer.setRemoteDescription(answer);
        await flushIce(from);
        setStatus("INTERCOM CONNECTED");
      } catch (error) {
        console.error("ScenePilot intercom answer error", error);
        setStatus("INTERCOM ERROR");
      }
    };

    const handleIce = async ({ from, candidate }) => {
      if (!from || !candidate) return;

      const peerState = peersRef.current[from];

      if (!peerState?.peer?.remoteDescription) {
        if (!pendingIceRef.current[from]) pendingIceRef.current[from] = [];
        pendingIceRef.current[from].push(candidate);
        return;
      }

      try {
        await peerState.peer.addIceCandidate(candidate);
      } catch (error) {
        console.warn("ScenePilot intercom ICE error", error);
      }
    };

    const handlePtt = payload => {
      if (!payload?.active) {
        setIncomingPtt(null);
        if (!talking) setStatus(enabled ? "INTERCOM READY" : "INTERCOM OFF");
        if (mode === "camera") {
          window.dispatchEvent(new CustomEvent("scenepilot:operator-alert", {
            detail: { type: "ptt", active: false }
          }));
        }
        return;
      }

      setIncomingPtt(payload);
      setStatus(
        payload.fromRole === "director"
          ? "DIRECTOR TALKING"
          : `CAM ${String(payload.slotId || "?").padStart(2, "0")} TALKING`
      );

      if (mode === "camera" && payload.fromRole === "director") {
        window.dispatchEvent(new CustomEvent("scenepilot:operator-alert", {
          detail: {
            type: "ptt",
            active: true,
            label: "DIRECTOR CALLING"
          }
        }));
      }
    };

    const handleConnect = () => {
      if (mode === "director") {
        socket.emit("director:focus", { room: roomCode });
      }
    };

    socket.on("room:cameras", handleRoomCameras);
    socket.on("camera:joined", handleCameraJoined);
    socket.on("camera:left", handleCameraLeft);
    socket.on("intercom:director", handleDirector);
    socket.on("intercom:offer", handleOffer);
    socket.on("intercom:answer", handleAnswer);
    socket.on("intercom:ice", handleIce);
    socket.on("intercom:ptt", handlePtt);
    socket.on("connect", handleConnect);

    if (mode === "director" && socket.connected) {
      socket.emit("director:focus", { room: roomCode });
    }

    return () => {
      socket.off("room:cameras", handleRoomCameras);
      socket.off("camera:joined", handleCameraJoined);
      socket.off("camera:left", handleCameraLeft);
      socket.off("intercom:director", handleDirector);
      socket.off("intercom:offer", handleOffer);
      socket.off("intercom:answer", handleAnswer);
      socket.off("intercom:ice", handleIce);
      socket.off("intercom:ptt", handlePtt);
      socket.off("connect", handleConnect);
    };
  }, [
    mode,
    roomCode,
    enabled,
    talking,
    buildPeer,
    flushIce,
    attachMicToPeer
  ]);

  useEffect(() => {
    if (mode !== "director" || !open) return;

    const ids =
      targetId
        ? [targetId]
        : targets.map(camera => camera.socketId);

    ids.forEach(id => {
      ensurePeer(id, true).catch(error => {
        console.warn("ScenePilot intercom preconnect error", error);
      });
    });
  }, [mode, open, targetId, targets, ensurePeer]);

  useEffect(() => {
    const stop = () => endTalk();

    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", stop);

    return () => {
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", stop);
    };
  }, [endTalk]);

  useEffect(() => {
    return () => {
      Object.values(peersRef.current).forEach(peerState => {
        try {
          peerState?.sendTrack?.stop?.();
          peerState?.peer?.close?.();
        } catch (_) {}
      });

      Object.values(audioElementsRef.current).forEach(element => {
        try {
          element.pause?.();
          element.srcObject = null;
        } catch (_) {}
      });

      micStreamRef.current?.getTracks?.().forEach(track => track.stop());
    };
  }, []);

  const targetLabel =
    mode === "director"
      ? (targetId
          ? (() => {
              const camera = targets.find(item => item.socketId === targetId);
              return camera
                ? `CAM ${String(camera.slotId || "?").padStart(2, "0")}`
                : "SELECTED CAMERA";
            })()
          : "ALL CAMERAS")
      : "DIRECTOR";

  if (mode === "camera") {
    return (
      <div className={`sp-intercom-camera ${incomingPtt ? "receiving" : ""}`}>
        <div className="sp-intercom-camera-status">
          <Headphones size={14}/>
          <span>{incomingPtt ? "DIRECTOR TALKING" : status}</span>
        </div>

        {!enabled ? (
          <button type="button" onClick={enableCameraIntercom}>
            <Mic size={13}/> ENABLE WALKIE-TALKIE
          </button>
        ) : (
          <button
            type="button"
            className={talking ? "talking" : ""}
            onPointerDown={beginTalk}
            onPointerUp={endTalk}
            onPointerCancel={endTalk}
            onPointerLeave={endTalk}
            onContextMenu={event => event.preventDefault()}
          >
            <Mic size={13}/> {talking ? "TALKING..." : "HOLD TO REPLY"}
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`sp-intercom-fab ${incomingPtt ? "receiving" : ""}`}
        onClick={() => setOpen(value => !value)}
      >
        <RadioTower size={16}/>
        WALKIE-TALKIE
        {incomingPtt && <b>RX</b>}
      </button>

      {open && (
        <section className="sp-intercom-panel">
          <header>
            <div>
              <span>PRIVATE CREW AUDIO</span>
              <strong>WALKIE-TALKIE</strong>
            </div>
            <button type="button" onClick={() => setOpen(false)}>
              <X size={16}/>
            </button>
          </header>

          <label>
            TALK TO
            <select value={targetId} onChange={event => setTargetId(event.target.value)}>
              <option value="">ALL CAMERAS</option>
              {targets.map(camera => (
                <option key={camera.socketId} value={camera.socketId}>
                  CAM {String(camera.slotId || "?").padStart(2, "0")} — {camera.name || "CAMERA"}
                </option>
              ))}
            </select>
          </label>

          <div className={`sp-intercom-status ${incomingPtt ? "receiving" : ""}`}>
            <i/>
            <span>{incomingPtt ? status : `${targetLabel} • ${status}`}</span>
          </div>

          <button
            type="button"
            className={`sp-intercom-ptt ${talking ? "talking" : ""}`}
            onPointerDown={beginTalk}
            onPointerUp={endTalk}
            onPointerCancel={endTalk}
            onPointerLeave={endTalk}
            onContextMenu={event => event.preventDefault()}
          >
            <Mic size={20}/>
            <strong>{talking ? "TRANSMITTING" : "HOLD TO TALK"}</strong>
            <small>{targetLabel}</small>
          </button>

          <p>Private intercom only — not sent to Program or Master Audio.</p>
        </section>
      )}
    </>
  );
}

function CommsPanel({ mode }) {
  const roomCode = new URLSearchParams(window.location.search).get("room") || "SP-4827";
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [targets, setTargets] = useState([]);
  const [targetId, setTargetId] = useState("");
  const [draft, setDraft] = useState("");
  const [unread, setUnread] = useState(0);
  const [incomingAlert, setIncomingAlert] = useState(null);
  const [cameraNames, setCameraNames] = useState(() => {
    try {
      return JSON.parse(
        window.localStorage.getItem(`scenepilot:cameraNames:${roomCode}`) || "{}"
      );
    } catch (_) {
      return {};
    }
  });

  useEffect(() => {
    const openFromMenu = () => openPanel();
    window.addEventListener("scenepilot:open-comms", openFromMenu);
    return () => window.removeEventListener("scenepilot:open-comms", openFromMenu);
  }, []);

  useEffect(() => {
    const clearOperatorAlert = () => {
      setIncomingAlert(null);
      setUnread(0);
    };

    window.addEventListener("scenepilot:operator-alert-cleared", clearOperatorAlert);
    return () => {
      window.removeEventListener("scenepilot:operator-alert-cleared", clearOperatorAlert);
    };
  }, []);

  useEffect(() => {
    if (!incomingAlert) return;

    const timer = window.setTimeout(() => {
      setIncomingAlert(null);
    }, 6500);

    return () => window.clearTimeout(timer);
  }, [incomingAlert]);

  useEffect(() => {
    const handleCameraNames = event => {
      if (event.detail?.roomCode !== roomCode) return;
      setCameraNames(event.detail?.names || {});
    };

    window.addEventListener("scenepilot:camera-names", handleCameraNames);
    return () => {
      window.removeEventListener("scenepilot:camera-names", handleCameraNames);
    };
  }, [roomCode]);

  const displayCameraName = camera =>
    cameraNames[String(camera?.slotId)] ||
    cameraNames[camera?.slotId] ||
    camera?.name ||
    "CAMERA";

  useEffect(() => {
    const handleMessage = message => {
      setMessages(current => [...current.slice(-49), message]);

      if (!open) {
        setUnread(value => value + 1);
        if (mode === "director" && message.fromRole === "camera") {
          window.dispatchEvent(new CustomEvent("scenepilot:secondary-tool-alert", {
            detail: {
              type: "comms",
              active: true,
              label: "CAMERA MESSAGE"
            }
          }));
        }
      }

      if (mode === "camera" && message.fromRole === "director") {
        setIncomingAlert(message);
        window.dispatchEvent(new CustomEvent("scenepilot:operator-alert", {
          detail: {
            type: "message",
            active: true,
            label: "NEW MESSAGE"
          }
        }));
      }
    };

    const handleCameras = cameras => {
      setTargets(cameras || []);
      setTargetId(current => {
        if (current && (cameras || []).some(camera => camera.socketId === current)) {
          return current;
        }
        return cameras?.[0]?.socketId || "";
      });
    };

    const handleJoined = camera => {
      setTargets(current => {
        const rest = current.filter(item => item.socketId !== camera.socketId);
        return [...rest, camera];
      });
      setTargetId(current => current || camera.socketId);
    };

    const handleLeft = ({ socketId }) => {
      setTargets(current => current.filter(camera => camera.socketId !== socketId));
      setTargetId(current => current === socketId ? "" : current);
    };

    socket.on("chat:message", handleMessage);
    socket.on("room:cameras", handleCameras);
    socket.on("camera:joined", handleJoined);
    socket.on("camera:left", handleLeft);

    return () => {
      socket.off("chat:message", handleMessage);
      socket.off("room:cameras", handleCameras);
      socket.off("camera:joined", handleJoined);
      socket.off("camera:left", handleLeft);
    };
  }, [open]);

  const visibleMessages = useMemo(() => {
    if (mode !== "director" || !targetId) return messages;
    return messages.filter(message =>
      !message.cameraId ||
      message.cameraId === targetId ||
      message.target === "all"
    );
  }, [messages, mode, targetId]);

  function openPanel() {
    setOpen(true);
    setUnread(0);
    if (mode === "director") {
      window.dispatchEvent(new CustomEvent("scenepilot:secondary-tool-alert", {
        detail: { type: "comms", active: false }
      }));
    }
  }

  function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !socket.connected) return;

    socket.emit("chat:send", {
      room: roomCode,
      text,
      target: mode === "director" ? (targetId || null) : null
    });

    setDraft("");
  }

  return (
    <>
      {mode === "camera" && incomingAlert && (
        <button
          className="sp-comms-alert"
          type="button"
          onClick={() => {
            setIncomingAlert(null);
            openPanel();
          }}
        >
          <span className="sp-comms-alert-label">DIRECTOR MESSAGE</span>
          <strong>{incomingAlert.text}</strong>
          <small>TAP TO OPEN COMMS</small>
        </button>
      )}

      {mode === "camera" && (
        <button className={`sp-comms-fab ${mode}`} onClick={openPanel}>
          <MessageSquare size={18}/>
          MESSAGE DIRECTOR
          {unread > 0 && <b>{unread > 9 ? "9+" : unread}</b>}
        </button>
      )}

      {open && (
        <div className="sp-comms-backdrop" onClick={() => setOpen(false)}>
          <section className={`sp-comms-panel ${mode}`} onClick={event => event.stopPropagation()}>
            <header>
              <div>
                <span className="sp-kicker">{mode === "camera" ? "DIRECTOR LINK" : "PRODUCTION COMMS"}</span>
                <strong>{mode === "camera" ? "Message the Director" : "Camera Operator Messages"}</strong>
              </div>
              <button onClick={() => setOpen(false)}><X size={18}/></button>
            </header>

            {mode === "director" && (
              <label className="sp-comms-target">
                SEND TO
                <select value={targetId} onChange={event => setTargetId(event.target.value)}>
                  <option value="">ALL CAMERAS</option>
                  {targets.map(camera => (
                    <option key={camera.socketId} value={camera.socketId}>
                      CAM {String(camera.slotId || "?").padStart(2,"0")} — {displayCameraName(camera)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="sp-comms-thread">
              {!visibleMessages.length && (
                <div className="sp-comms-empty">
                  <MessageSquare size={28}/>
                  <span>No messages yet.</span>
                </div>
              )}

              {visibleMessages.map(message => (
                <article
                  key={message.id}
                  className={message.fromRole === mode ? "mine" : ""}
                >
                  <small>
                    {message.fromRole === "director"
                      ? "DIRECTOR"
                      : cameraNames[String(message.slotId)] || message.fromName || `CAM ${String(message.slotId || "?").padStart(2,"0")}`}
                  </small>
                  <p>{message.text}</p>
                  <time>{new Date(message.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
                </article>
              ))}
            </div>

            <form onSubmit={sendMessage}>
              <input
                value={draft}
                onChange={event => setDraft(event.target.value)}
                placeholder={
                  socket.connected
                    ? "Type a production message..."
                    : "Connect to the production first..."
                }
                maxLength={500}
                disabled={!socket.connected}
              />
              <button disabled={!draft.trim() || !socket.connected}><Send size={17}/></button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

function AdminPage({ user, onLogout }) {
  const [users, setUsers] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [status, setStatus] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");

  async function load() {
    try {
      const [userData, campaignData] = await Promise.all([
        api("/api/admin/users"),
        api("/api/admin/campaigns")
      ]);
      setUsers(userData.users || []);
      setCampaigns(campaignData.campaigns || []);
    } catch (error) {
      setStatus(error.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function updateAccess(targetUser, field, value) {
    try {
      await api(`/api/admin/users/${targetUser.id}/access`, {
        method: "POST",
        body: JSON.stringify({
          plan: field === "plan" ? value : targetUser.plan,
          accessStatus: field === "accessStatus" ? value : targetUser.accessStatus,
          role: field === "role" ? value : targetUser.role
        })
      });
      await load();
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function saveCampaign(event) {
    event.preventDefault();
    try {
      await api("/api/admin/campaigns", {
        method: "POST",
        body: JSON.stringify({ subject, bodyText })
      });
      setSubject("");
      setBodyText("");
      setStatus("Campaign draft saved. Delivery service will connect in the email phase.");
      await load();
    } catch (error) {
      setStatus(error.message);
    }
  }

  return (
    <div className="sp-admin">
      <header>
        <div>
          <span className="sp-kicker">I COMPUTER ANYTHING • SOFTWARE ADMIN</span>
          <h1>ScenePilot Accounts</h1>
        </div>
        <div className="sp-admin-actions">
          <button onClick={() => go("/app")}>OPEN SCENEPILOT</button>
          <button onClick={() => window.location.assign("https://icomputeranything.com/master")}>ICA MASTER</button>
          <button onClick={onLogout}><LogOut size={15}/> LOGOUT</button>
        </div>
      </header>

      {status && <div className="sp-admin-status">{status}</div>}

      <section className="sp-admin-summary">
        <article><Users size={20}/><strong>{users.length}</strong><span>ACCOUNTS</span></article>
        <article><Mail size={20}/><strong>{users.filter(item => item.marketingOptIn).length}</strong><span>UPDATE OPT-INS</span></article>
        <article><Crown size={20}/><strong>{users.filter(item => item.plan === "pro").length}</strong><span>PRO</span></article>
      </section>

      <section className="sp-admin-card">
        <div className="sp-admin-card-head">
          <div>
            <span className="sp-kicker">CUSTOMERS / BETA USERS</span>
            <h2>Account access</h2>
          </div>
        </div>

        <div className="sp-user-table-wrap">
          <table className="sp-user-table">
            <thead>
              <tr>
                <th>USER</th>
                <th>ROLE</th>
                <th>PLAN</th>
                <th>ACCESS</th>
                <th>UPDATES</th>
              </tr>
            </thead>
            <tbody>
              {users.map(item => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.displayName || "—"}</strong>
                    <small>{item.email}</small>
                  </td>
                  <td>
                    <select
                      value={item.role}
                      disabled={item.id === user.id}
                      onChange={event => updateAccess(item, "role", event.target.value)}
                    >
                      <option value="user">USER</option>
                      <option value="admin">ADMIN</option>
                    </select>
                  </td>
                  <td>
                    <select value={item.plan} onChange={event => updateAccess(item, "plan", event.target.value)}>
                      <option value="beta">BETA</option>
                      <option value="free">FREE</option>
                      <option value="ambassador">AMBASSADOR</option>
                      <option value="pro">PRO</option>
                    </select>
                  </td>
                  <td>
                    <select value={item.accessStatus} onChange={event => updateAccess(item, "accessStatus", event.target.value)}>
                      <option value="pending">PENDING</option>
                      <option value="active">ACTIVE</option>
                      <option value="suspended">SUSPENDED</option>
                    </select>
                  </td>
                  <td>{item.marketingOptIn ? "YES" : "NO"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sp-admin-card sp-campaign-card">
        <div>
          <span className="sp-kicker">PRODUCT UPDATES</span>
          <h2>Email campaign drafts</h2>
          <p>
            Build the update here now. Actual bulk delivery will be connected to an email provider
            before this can send to customers.
          </p>
        </div>

        <form onSubmit={saveCampaign}>
          <input value={subject} onChange={event => setSubject(event.target.value)} placeholder="Campaign subject" required/>
          <textarea value={bodyText} onChange={event => setBodyText(event.target.value)} placeholder="Write the product update..." rows={7} required/>
          <button><Mail size={16}/> SAVE CAMPAIGN DRAFT</button>
        </form>

        <div className="sp-campaign-list">
          {campaigns.map(campaign => (
            <article key={campaign.id}>
              <strong>{campaign.subject}</strong>
              <span>{campaign.status.toUpperCase()} • {new Date(campaign.createdAt).toLocaleDateString()}</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function ScenePilotPortal() {
  const params = new URLSearchParams(window.location.search);
  const cameraMode = params.get("camera") === "1";
  const cleanPath = window.location.pathname.replace(/\/+$/, "") || "/";
  const watchMatch = cleanPath.match(/^\/watch\/([A-Za-z0-9_-]{1,80})$/);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!cameraMode);

  useEffect(() => {
    if (cameraMode) return;

    api("/api/auth/me")
      .then(data => setUser(data.user || null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [cameraMode]);

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST", body: "{}" });
    } catch (_) {}
    setUser(null);
    go("/");
  }

  if (watchMatch) {
    return <WatchPage roomCode={watchMatch[1]}/>;
  }

  if (cameraMode) {
    return (
      <>
        <App/>
        <IntercomPanel mode="camera"/>
        <CommsPanel mode="camera"/>
      </>
    );
  }

  if (cleanPath === "/admin") {
    if (loading) return <div className="sp-portal-loading"><Radio size={28}/> LOADING ICA ACCOUNT...</div>;
    if (!user) return <AuthPanel onAuthenticated={setUser}/>;
    if (user.role !== "owner" && user.role !== "admin") {
      return (
        <div className="sp-auth-shell">
          <div className="sp-auth-card">
            <LockKeyhole size={28}/>
            <h1>Admin access required.</h1>
            <button className="sp-auth-submit" onClick={() => go("/app")}>RETURN TO SCENEPILOT</button>
          </div>
        </div>
      );
    }
    return <AdminPage user={user} onLogout={logout}/>;
  }

  if (cleanPath === "/register") {
    if (loading) return <div className="sp-portal-loading"><Radio size={28}/> LOADING ICA ACCOUNT...</div>;
    if (user) return <AuthPanel onAuthenticated={setUser} initialMode="register"/>;
    return <AuthPanel onAuthenticated={setUser} initialMode="register"/>;
  }

  if (cleanPath === "/app") {
    if (loading) return <div className="sp-portal-loading"><Radio size={28}/> LOADING ICA ACCOUNT...</div>;
    if (!user) return <AuthPanel onAuthenticated={setUser}/>;

    return (
      <>
        <App user={user} onLogout={logout}/>
        <IntercomPanel mode="director"/>
        <CommsPanel mode="director"/>
      </>
    );
  }

  return <LandingPage/>;
}
