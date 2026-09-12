import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Radio, LogIn, UserPlus, LockKeyhole, MessageSquare,
  Send, ShieldCheck, Users, ArrowRight, LogOut, Crown, Mail,
  X, Camera, RadioTower, Mic, Headphones, Cast, Maximize2, Smartphone,
  Monitor, Film, Layers3, Server, Globe2, CheckCircle2, Trash2, RefreshCw
} from "lucide-react";
import App from "./App.jsx";
import TurnstileWidget from "./TurnstileWidget.jsx";
import { socket } from "./socket";
import { subscribeToRealtimeProgram } from "./cloudflareRealtime";
import { apiFetch, setNativeSessionToken } from "./runtimeApi";
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
    let realtime = null;
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

    const markLive = () => setStatus(video.srcObject ? "LIVE — REALTIME" : "LIVE");
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

    const startHls = () => {
      if (cancelled) return;
      video.srcObject = null;

      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = streamUrl;
        video.load();
        video.play().catch(() => {});
        return;
      }

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
    };

    subscribeToRealtimeProgram(safeRoom, video)
      .then(connection => {
        if (cancelled) return connection.stop();
        realtime = connection;
        setStatus("LIVE — REALTIME");
      })
      .catch(() => startHls());

    return () => {
      cancelled = true;
      video.removeEventListener("playing", markLive);
      video.removeEventListener("loadedmetadata", seekToLiveEdge);
      video.removeEventListener("canplay", seekToLiveEdge);
      video.removeEventListener("timeupdate", catchUpToLive);
      realtime?.stop();
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
      console.warn("Urban Director Studio TV playback picker unavailable", error);
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
      console.warn("Urban Director Studio fullscreen unavailable", error);

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
        <div className="sp-watch-brand"><RadioTower size={20}/> URBAN DIRECTOR STUDIO LIVE</div>
        <div className="sp-watch-video">
          <video
            ref={videoRef}
            controls
            autoPlay
            playsInline
            x-webkit-airplay="allow"
            aria-label={`Urban Director Studio live room ${safeRoom}`}
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

function CameraAppHandoff() {
  const params = new URLSearchParams(window.location.search);
  const cameraParams = new URLSearchParams({ camera: "1" });

  for (const key of ["network", "room", "join"]) {
    const value = params.get(key);
    if (value && value.length <= 512) cameraParams.set(key, value);
  }

  const query = cameraParams.toString();
  const appUrl = `scenepilot://camera?${query}`;
  const browserUrl = `/app?${query}`;

  useEffect(() => {
    const timer = window.setTimeout(() => window.location.assign(appUrl), 150);
    return () => window.clearTimeout(timer);
  }, [appUrl]);

  return (
    <div className="sp-auth-shell">
      <div className="sp-auth-card">
        <Smartphone size={30}/>
        <span className="sp-kicker">URBAN DIRECTOR STUDIO CAMERA</span>
        <h1>Open the camera in Urban Director Studio.</h1>
        <p>The installed app can share battery status. Chrome cannot provide it on iPhone or iPad.</p>
        <button className="sp-auth-submit" onClick={() => window.location.assign(appUrl)}>
          OPEN URBAN DIRECTOR STUDIO APP
        </button>
        <button className="sp-secondary" onClick={() => window.location.assign(browserUrl)}>
          CONTINUE IN BROWSER
        </button>
      </div>
    </div>
  );
}

async function api(path, options = {}) {
  const response = await apiFetch(path, {
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
          ? "Urban Director Studio returned an unreadable response."
          : `Urban Director Studio account service failed (HTTP ${response.status}).`
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

  if (data?.sessionToken) {
    setNativeSessionToken(data.sessionToken);
  }

  return data;
}

function go(path) {
  window.location.assign(path);
}

function LandingPage() {
  return (
    <div className="sp-landing sp-product-site">
      <header className="sp-landing-nav">
        <button className="sp-landing-brand sp-brand-button" onClick={() => go("/")} aria-label="Urban Director Studio home">
          <span className="sp-landing-mark"><Radio size={24}/></span>
          <div>
            <strong>URBAN DIRECTOR STUDIO</strong>
            <small>BY I COMPUTER ANYTHING</small>
          </div>
        </button>

        <nav className="sp-public-nav" aria-label="Product navigation">
          <a href="#features">FEATURES</a>
          <a href="#workflow">HOW IT WORKS</a>
          <a href="#use-cases">USE CASES</a>
          <a href="#pricing">PRICING</a>
        </nav>

        <div className="sp-nav-account-actions">
          <button className="sp-nav-create" onClick={() => go("/register")}>
            <UserPlus size={17}/> CREATE ACCOUNT
          </button>
          <button className="sp-nav-login" onClick={() => go("/app")}>
            <LogIn size={17}/> OPEN STUDIO
          </button>
        </div>
      </header>

      <main>
        <section className="sp-hero sp-product-hero">
          <div className="sp-hero-copy">
            <span className="sp-kicker">LIVE PRODUCTION • MULTI-CAMERA • REMOTE CREW</span>
            <h1>Direct the whole production from one control room.</h1>
            <p>
              Urban Director Studio turns phones, tablets, cameras, capture devices, and external audio
              sources into one coordinated live-production system. Switch cameras, communicate with operators,
              add graphics, record, replay, and broadcast from a single Director console.
            </p>

            <div className="sp-hero-actions">
              <button className="sp-primary sp-hero-primary" onClick={() => go("/app")}>
                <RadioTower size={18}/> OPEN URBAN DIRECTOR STUDIO
              </button>
              <button className="sp-secondary" onClick={() => go("/register")}>
                <UserPlus size={18}/> CREATE ACCOUNT
              </button>
            </div>

            <div className="sp-hero-proof">
              <span><CheckCircle2 size={15}/> Wireless phone cameras</span>
              <span><CheckCircle2 size={15}/> Director-to-crew comms</span>
              <span><CheckCircle2 size={15}/> Replay, graphics & recording</span>
            </div>
          </div>

          <div className="sp-hero-console sp-product-console" aria-label="Urban Director Studio console preview">
            <div className="sp-console-top">
              <span><i/> DIRECTOR ONLINE</span>
              <span>ROOM UDS-4827</span>
            </div>

            <div className="sp-console-screens">
              <div className="sp-screen-preview">
                <Camera size={38}/>
                <strong>PREVIEW</strong>
                <small>CAM 07 • STAGE LEFT</small>
              </div>
              <div className="sp-screen-program">
                <RadioTower size={38}/>
                <strong>PROGRAM</strong>
                <small>LIVE • CAM 02</small>
              </div>
            </div>

            <div className="sp-console-cams">
              {[1,2,3,4,5,6].map(cam => (
                <span key={cam} className={cam === 2 ? "live" : cam === 7 ? "preview" : ""}>
                  CAM {String(cam).padStart(2,"0")}
                </span>
              ))}
            </div>

            <div className="sp-console-tools">
              <span>MASTER AUDIO</span>
              <span>INSTANT REPLAY</span>
              <span>GRAPHICS</span>
              <span>BROADCAST</span>
            </div>
          </div>
        </section>

        <section className="sp-feature-strip sp-public-proof-strip">
          <article>
            <Camera size={22}/>
            <strong>MULTI-CAMERA</strong>
            <p>Connect phones, tablets, capture devices, and camera sources to one production room.</p>
          </article>
          <article>
            <RadioTower size={22}/>
            <strong>LIVE DIRECTING</strong>
            <p>Preview sources, take cameras to Program, and manage the production from one console.</p>
          </article>
          <article>
            <MessageSquare size={22}/>
            <strong>CREW COMMS</strong>
            <p>Use private text and walkie-talkie communication between the Director and camera operators.</p>
          </article>
          <article>
            <ShieldCheck size={22}/>
            <strong>CONTROLLED ACCESS</strong>
            <p>Director access stays protected while camera operators join the room through controlled links.</p>
          </article>
        </section>

        <section className="sp-public-section" id="features">
          <div className="sp-section-heading">
            <span className="sp-kicker">THE PRODUCTION TOOLKIT</span>
            <h2>Everything the Director needs, without dragging a control room everywhere.</h2>
            <p>
              Urban Director Studio is built around the actual production workflow: get sources connected,
              communicate with the crew, cut the show, capture the Program feed, and get it out to an audience.
            </p>
          </div>

          <div className="sp-feature-grid">
            <article>
              <Camera size={24}/>
              <h3>Wireless Camera Operators</h3>
              <p>Turn compatible phones and tablets into remote camera sources with operator controls and room assignment.</p>
            </article>
            <article>
              <Monitor size={24}/>
              <h3>Director Multiview</h3>
              <p>See connected sources, prepare Preview, take Program, manage camera names, and control the production layout.</p>
            </article>
            <article>
              <Mic size={24}/>
              <h3>Master Audio & External Sources</h3>
              <p>Use camera audio, the Director device, or connected audio interfaces and capture hardware as production sources.</p>
            </article>
            <article>
              <Film size={24}/>
              <h3>Recording & Instant Replay</h3>
              <p>Capture production recordings, maintain replay buffers, and move recorded material into the edit workflow.</p>
            </article>
            <article>
              <Layers3 size={24}/>
              <h3>Graphics & Overlays</h3>
              <p>Run lower thirds, tickers, countdowns, topic graphics, logo bugs, and other on-air visual elements.</p>
            </article>
            <article>
              <Globe2 size={24}/>
              <h3>Broadcast & Remote Viewing</h3>
              <p>Publish the Program feed to configured destinations and provide viewers with a dedicated live watch experience.</p>
            </article>
          </div>
        </section>

        <section className="sp-workflow-section" id="workflow">
          <div className="sp-section-heading">
            <span className="sp-kicker">HOW IT WORKS</span>
            <h2>Scan. Connect. Direct. Broadcast.</h2>
          </div>

          <div className="sp-workflow-grid">
            <article>
              <b>01</b>
              <Smartphone size={25}/>
              <h3>Create the production room</h3>
              <p>The Director opens a room and prepares the production from the main console.</p>
            </article>
            <article>
              <b>02</b>
              <Camera size={25}/>
              <h3>Connect camera operators</h3>
              <p>Crew members use the production link or QR workflow to join with their camera devices.</p>
            </article>
            <article>
              <b>03</b>
              <RadioTower size={25}/>
              <h3>Run the show</h3>
              <p>Preview, switch, communicate, control audio, trigger graphics, and manage the live Program feed.</p>
            </article>
            <article>
              <b>04</b>
              <Cast size={25}/>
              <h3>Record or publish</h3>
              <p>Capture the production, use replay and editing tools, or send the Program feed to your audience.</p>
            </article>
          </div>
        </section>

        <section className="sp-showcase-section">
          <div className="sp-showcase-copy">
            <span className="sp-kicker">THE DIRECTOR CONSOLE</span>
            <h2>Built to feel like production software, not a pile of disconnected tools.</h2>
            <p>
              The Director stays in one operational view while camera sources, Program/Preview, communication,
              audio, graphics, replay, and broadcast controls work together around the same room.
            </p>
            <button className="sp-secondary" onClick={() => go("/app")}>
              OPEN THE CONSOLE <ArrowRight size={17}/>
            </button>
          </div>

          <div className="sp-showcase-ui">
            <header>
              <span><i/> SYSTEM READY</span>
              <strong>URBAN DIRECTOR STUDIO</strong>
              <span>DIRECTOR</span>
            </header>
            <div className="sp-showcase-program">
              <div>
                <span>PREVIEW</span>
                <Camera size={42}/>
                <small>CAM 04</small>
              </div>
              <div className="program">
                <span>PROGRAM</span>
                <RadioTower size={42}/>
                <small>CAM 01 • LIVE</small>
              </div>
            </div>
            <div className="sp-showcase-bottom">
              <span>CAM 01</span><span>CAM 02</span><span>CAM 03</span><span>CAM 04</span>
              <span>REPLAY</span><span>GRAPHICS</span><span>AUDIO</span><span>GO LIVE</span>
            </div>
          </div>
        </section>

        <section className="sp-public-section" id="use-cases">
          <div className="sp-section-heading">
            <span className="sp-kicker">BUILT FOR REAL PRODUCTIONS</span>
            <h2>One platform, a lot of ways to use it.</h2>
          </div>

          <div className="sp-use-grid">
            <article><RadioTower size={23}/><h3>Live Events</h3><p>Direct conferences, performances, ceremonies, community events, and multi-camera live coverage.</p></article>
            <article><Mic size={23}/><h3>Podcasts & Interviews</h3><p>Use multiple angles, external audio, lower thirds, and recorded Program output from one production room.</p></article>
            <article><Users size={23}/><h3>Sports & Community Coverage</h3><p>Position camera operators around a venue and keep the Director in control of the final live feed.</p></article>
            <article><Smartphone size={23}/><h3>Field Production</h3><p>Use mobile devices as flexible sources when a traditional truck-sized production setup is not practical.</p></article>
          </div>
        </section>

        <section className="sp-platform-section">
          <div>
            <span className="sp-kicker">ONE PRODUCT • MULTIPLE SCREENS</span>
            <h2>Work from the devices your production already uses.</h2>
            <p>Urban Director Studio is designed around a shared account and production-room workflow across web, mobile, and desktop release channels.</p>
          </div>

          <div className="sp-platform-grid">
            <article><Globe2 size={24}/><strong>WEB</strong><span>Director console and account access</span></article>
            <article><Smartphone size={24}/><strong>iPHONE / iPAD</strong><span>Native mobile production workflow</span></article>
            <article><Monitor size={24}/><strong>WINDOWS / macOS</strong><span>Desktop production packaging</span></article>
            <article><Server size={24}/><strong>SELF-HOSTED BACKEND</strong><span>Production services under your control</span></article>
          </div>
        </section>

        <section className="sp-pricing-section" id="pricing">
          <div className="sp-pricing-copy">
            <span className="sp-kicker">URBAN DIRECTOR STUDIO PRO</span>
            <h2>Professional production software without production-truck pricing.</h2>
            <p>One monthly plan built around the complete Director workflow.</p>
          </div>

          <div className="sp-price-card">
            <div className="sp-price-line">
              <span>$</span><strong>29.99</strong><small>/ month</small>
            </div>
            <ul>
              <li><CheckCircle2 size={16}/> Multi-camera Director console</li>
              <li><CheckCircle2 size={16}/> Wireless camera operators</li>
              <li><CheckCircle2 size={16}/> Crew messaging & private intercom</li>
              <li><CheckCircle2 size={16}/> Recording, replay & editing workflow</li>
              <li><CheckCircle2 size={16}/> Broadcast graphics & overlays</li>
              <li><CheckCircle2 size={16}/> Broadcast / destination controls</li>
            </ul>
            <button className="sp-primary" onClick={() => go("/register")}>
              CREATE YOUR ACCOUNT <ArrowRight size={17}/>
            </button>
            <small className="sp-price-note">Platform-specific purchase options are handled through the supported release channel.</small>
          </div>
        </section>

        <section className="sp-faq-section">
          <div className="sp-section-heading">
            <span className="sp-kicker">QUESTIONS</span>
            <h2>Urban Director Studio, broken down.</h2>
          </div>

          <div className="sp-faq-list">
            <details>
              <summary>Do all camera operators need the Director login?</summary>
              <p>No. The Director controls the room while camera operators can join through the controlled production-camera workflow.</p>
            </details>
            <details>
              <summary>Can I use phones as cameras?</summary>
              <p>Yes. Mobile devices are a core part of the system and can operate as wireless production cameras when supported by the device and browser/app environment.</p>
            </details>
            <details>
              <summary>Can I use external audio or capture hardware?</summary>
              <p>Urban Director Studio is designed to work with available browser/native media inputs, including compatible external audio and video capture devices.</p>
            </details>
            <details>
              <summary>Can I record and replay?</summary>
              <p>Yes. The production workflow includes recording, Program-master handling, instant replay support, and an editing/replay workspace.</p>
            </details>
            <details>
              <summary>Who builds and supports Urban Director Studio?</summary>
              <p>Urban Director Studio is built by I Computer Anything and is part of the ICA software platform.</p>
            </details>
          </div>
        </section>

        <section className="sp-final-cta">
          <div>
            <span className="sp-kicker">READY WHEN THE PRODUCTION IS</span>
            <h2>Put the control room wherever you are.</h2>
            <p>Create your Urban Director Studio account and open the Director console.</p>
          </div>
          <div>
            <button className="sp-primary" onClick={() => go("/register")}>
              CREATE ACCOUNT <ArrowRight size={17}/>
            </button>
            <button className="sp-secondary" onClick={() => go("/app")}>
              <LogIn size={17}/> LOGIN
            </button>
          </div>
        </section>
      </main>

      <footer className="sp-landing-footer sp-product-footer">
        <div>
          <strong>URBAN DIRECTOR STUDIO</strong>
          <span>Built by I Computer Anything</span>
        </div>
        <div>
          <button onClick={() => go("/privacy")}>PRIVACY</button>
          <button onClick={() => go("/support")}>SUPPORT</button>
          <button onClick={() => window.location.assign("https://icomputeranything.com")}>I COMPUTER ANYTHING</button>
          <button onClick={() => go("/app")}>LOGIN</button>
        </div>
      </footer>
    </div>
  );
}

function PrivacyPage() {
  return (
    <main className="sp-privacy-shell">
      <section className="sp-privacy-card">
        <button className="sp-auth-back sp-privacy-back" onClick={() => go("/")}>← Urban Director Studio home</button>
        <span className="sp-kicker">PRIVACY</span>
        <h1>Urban Director Studio Privacy Policy</h1>
        <p className="sp-privacy-updated">Last updated: September 12, 2026</p>

        <h2>Information we collect</h2>
        <p>
          When you create an Urban Director Studio account, we collect your name, email address,
          password credentials in hashed form, account role and access status, and optional
          product-update consent. We also keep operational information needed to maintain signed-in
          sessions and production-room access.
        </p>

        <h2>Camera, microphone, and production media</h2>
        <p>
          Urban Director Studio requests camera and microphone access only when you use production
          features that need them. Live audio and video may be transmitted through our production
          infrastructure and service providers so connected cameras, Directors, viewers, or broadcast
          destinations can receive the production. The app does not request your precise location.
        </p>

        <h2>Recordings and broadcast destinations</h2>
        <p>
          Recordings created on your device remain under your control unless you choose to upload,
          publish, or send them to a configured destination. If you configure a streaming destination,
          the app stores the destination settings needed to operate that connection. Stream credentials
          are protected before storage.
        </p>

        <h2>Device and connection information</h2>
        <p>
          Production features may use limited device and connection information such as battery level,
          network quality, session identifiers, and browser or app user-agent information to display
          operator status, maintain connections, and troubleshoot reliability.
        </p>

        <h2>How we use information</h2>
        <p>
          We use account and production information to authenticate users, operate production rooms,
          connect camera operators and Directors, provide live production features, secure the service,
          troubleshoot problems, and communicate product updates when you opt in.
        </p>

        <h2>Service providers and third-party destinations</h2>
        <p>
          Urban Director Studio uses infrastructure providers, including Cloudflare, to deliver account,
          database, networking, and realtime production services. When you choose to broadcast to an
          external destination, information and media are also handled according to that destination's
          policies and your configuration.
        </p>

        <h2>Data retention and account deletion</h2>
        <p>
          Account information is retained while your account remains active or as needed to operate the
          service. You can permanently delete your Urban Director Studio account from the Director menu
          inside the app. Account deletion removes your account record and associated Urban Director
          Studio data that we are not legally required to retain.
        </p>

        <h2>Your choices</h2>
        <p>
          You may decline optional marketing messages, control camera and microphone permissions in your
          device settings, stop a broadcast at any time, and permanently delete your account from inside
          the app.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about Urban Director Studio privacy can be sent through I Computer Anything at
          icomputeranything.com.
        </p>
      </section>
    </main>
  );
}

function SupportPage() {
  return (
    <main className="sp-privacy-shell">
      <section className="sp-privacy-card">
        <button className="sp-auth-back sp-privacy-back" onClick={() => go("/")}>← Urban Director Studio home</button>
        <span className="sp-kicker">SUPPORT</span>
        <h1>Urban Director Studio Support</h1>
        <p>
          Need help with account access, camera connections, live production, recording,
          broadcast setup, or another Urban Director Studio feature? Contact I Computer Anything.
        </p>

        <h2>Email support</h2>
        <p>
          <a className="sp-support-link" href="mailto:ryanedavis@gmail.com?subject=Urban%20Director%20Studio%20Support">
            ryanedavis@gmail.com
          </a>
        </p>

        <h2>Product and business support</h2>
        <p>
          Visit <a className="sp-support-link" href="https://icomputeranything.com">icomputeranything.com</a>
          for I Computer Anything contact options and product information.
        </p>

        <h2>When contacting support</h2>
        <p>
          Include the device you are using, the production room or feature involved, and a short
          description of what happened. Do not send passwords, stream keys, or other account secrets.
        </p>
      </section>
    </main>
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

      if (data.user) {
        onAuthenticated(data.user);
        return;
      }

      setStatus(
        data.message ||
        (mode === "register"
          ? "Account created. Sign in to continue."
          : "Sign in could not be completed.")
      );
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
      <button className="sp-auth-back" onClick={() => go("/")}>← Urban Director Studio home</button>
      <div className="sp-auth-card">
        <div className="sp-auth-logo"><Radio size={26}/></div>
        <span className="sp-kicker">ICA SOFTWARE ACCOUNT</span>
        <h1>{mode === "register" ? "Create your account." : "Welcome back."}</h1>
        <p>
          {mode === "register"
            ? "Create your ICA Software account. Director access is activated after your account is approved."
            : "Sign in to open the Director console after your Urban Director Studio access has been activated."}
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
              <span>Optional: Email me Urban Director Studio and ICA product updates, feature announcements, and occasional offers.</span>
            </label>
          )}

          <TurnstileWidget
            action={mode === "register" ? "register" : "login"}
            onToken={handleTurnstileToken}
            resetKey={turnstileResetKey}
          />

          {status && <div className="sp-auth-error">{status}</div>}

          <p className="sp-auth-legal">
            By continuing, you agree to the account terms and acknowledge the
            <button type="button" onClick={() => go("/privacy")}> Urban Director Studio Privacy Policy</button>.
          </p>

          <button className="sp-auth-submit" disabled={busy || !turnstileToken}>
            {mode === "register" ? <UserPlus size={17}/> : <LogIn size={17}/>}
            {busy ? "PLEASE WAIT..." : mode === "register" ? "CREATE ACCOUNT" : "LOGIN"}
          </button>
        </form>
      </div>
    </div>
  );
}

function AccessStatusPage({ user, onLogout, onDeleteAccount }) {
  const pending = user?.accessStatus === "pending";
  const suspended = user?.accessStatus === "suspended";

  return (
    <div className="sp-auth-shell">
      <div className="sp-auth-card sp-access-status-card">
        <div className="sp-auth-logo"><LockKeyhole size={26}/></div>
        <span className="sp-kicker">URBAN DIRECTOR STUDIO ACCOUNT</span>
        <h1>{pending ? "Access pending." : suspended ? "Access suspended." : "Account access."}</h1>
        <p>
          {pending
            ? "Your account is signed in and waiting for Director access approval. You can check again, sign out, or permanently delete your account."
            : suspended
              ? "Director access is currently suspended. You can sign out or permanently delete your account."
              : "Your account is signed in, but Director access is not currently available."}
        </p>

        <div className="sp-access-status-actions">
          {pending && (
            <button className="sp-auth-submit" type="button" onClick={() => window.location.reload()}>
              <RefreshCw size={17}/> CHECK ACCESS
            </button>
          )}
          <button className="sp-secondary" type="button" onClick={onLogout}>
            <LogOut size={17}/> LOG OUT
          </button>
          <button className="sp-delete-account-button" type="button" onClick={onDeleteAccount}>
            <Trash2 size={17}/> DELETE ACCOUNT
          </button>
          <button className="sp-access-privacy" type="button" onClick={() => go("/privacy")}>
            PRIVACY POLICY
          </button>
        </div>
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
        <small>{String(user.plan || "free").toUpperCase()}</small>
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
        console.warn("Urban Director Studio intercom queued ICE error", error);
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
      console.error("Urban Director Studio intercom microphone error", error);
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
      console.error("Urban Director Studio intercom transmit error", error);
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
        console.error("Urban Director Studio intercom offer error", error);
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
        console.error("Urban Director Studio intercom answer error", error);
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
        console.warn("Urban Director Studio intercom ICE error", error);
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
        console.warn("Urban Director Studio intercom preconnect error", error);
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
          <h1>Urban Director Studio Accounts</h1>
        </div>
        <div className="sp-admin-actions">
          <button onClick={() => go("/app")}>OPEN URBAN DIRECTOR STUDIO</button>
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
            <span className="sp-kicker">CUSTOMER ACCOUNTS</span>
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
                      <option value="beta">LEGACY</option>
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
    setNativeSessionToken("");
    setUser(null);
    go("/");
  }

  async function deleteAccount() {
    if (!user) return;

    const accepted = window.confirm(
      "Permanently delete your Urban Director Studio account and associated data? This cannot be undone."
    );
    if (!accepted) return;

    const confirmation = window.prompt('Type DELETE to confirm permanent account deletion.');
    if (confirmation !== "DELETE") return;

    try {
      await api("/api/auth/account", {
        method: "DELETE",
        body: JSON.stringify({ confirm: "DELETE" })
      });
      setNativeSessionToken("");
      setUser(null);
      window.alert("Your Urban Director Studio account has been permanently deleted.");
      go("/");
    } catch (error) {
      window.alert(error.message || "Account deletion could not be completed.");
    }
  }

  if (watchMatch) {
    return <WatchPage roomCode={watchMatch[1]}/>;
  }

  if (cleanPath === "/privacy") {
    return <PrivacyPage/>;
  }

  if (cleanPath === "/support") {
    return <SupportPage/>;
  }

  if (cleanPath === "/camera-open") {
    return <CameraAppHandoff/>;
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
            <button className="sp-auth-submit" onClick={() => go("/app")}>RETURN TO URBAN DIRECTOR STUDIO</button>
          </div>
        </div>
      );
    }
    return <AdminPage user={user} onLogout={logout}/>;
  }

  if (cleanPath === "/register") {
    if (loading) return <div className="sp-portal-loading"><Radio size={28}/> LOADING ICA ACCOUNT...</div>;
    if (user?.accessStatus !== "active") {
      return <AccessStatusPage user={user} onLogout={logout} onDeleteAccount={deleteAccount}/>;
    }
    if (user) {
      window.location.replace("/app");
      return <div className="sp-portal-loading"><Radio size={28}/> OPENING URBAN DIRECTOR STUDIO...</div>;
    }
    return <AuthPanel onAuthenticated={setUser} initialMode="register"/>;
  }

  if (cleanPath === "/app") {
    if (loading) return <div className="sp-portal-loading"><Radio size={28}/> LOADING ICA ACCOUNT...</div>;
    if (!user) return <AuthPanel onAuthenticated={setUser}/>;
    if (user.accessStatus !== "active") {
      return <AccessStatusPage user={user} onLogout={logout} onDeleteAccount={deleteAccount}/>;
    }

    return (
      <>
        <App user={user} onLogout={logout} onDeleteAccount={deleteAccount}/>
        <IntercomPanel mode="director"/>
        <CommsPanel mode="director"/>
      </>
    );
  }

  return <LandingPage/>;
}
