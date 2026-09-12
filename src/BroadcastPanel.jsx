import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  RadioTower, Users, Camera, Video,
  Server, Settings2, Eye, EyeOff, Play, Square, Globe2, Save, CheckCircle2,
  Copy, Share2, QrCode, ExternalLink
} from "lucide-react";
import { publishProgramToRealtime } from "./cloudflareRealtime";
import "./BroadcastPanel.css";

const DESTINATIONS = [
  { id: "facebook", name: "Facebook", icon: Users, kind: "external" },
  { id: "instagram", name: "Instagram", icon: Camera, kind: "external" },
  { id: "youtube", name: "YouTube", icon: Video, kind: "external" },
  { id: "twitch", name: "Twitch", icon: RadioTower, kind: "external" },
  { id: "tiktok", name: "TikTok", icon: RadioTower, kind: "external" },
  { id: "self", name: "Urban Director Studio Self-Hosted", icon: Server, kind: "self" },
  { id: "custom", name: "Custom RTMP", icon: Globe2, kind: "custom" }
];

const EMPTY_SETTINGS = Object.fromEntries(
  DESTINATIONS.map(destination => [
    destination.id,
    { url: "", key: "", configured: false, status: "not_configured" }
  ])
);

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Urban Director Studio broadcast request failed (HTTP ${response.status}).`);
  }

  return data;
}

export default function BroadcastPanel({ roomCode = "SP-4827", getProgramStream }) {
  const [selected, setSelected] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [encoderConnected, setEncoderConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [showShare, setShowShare] = useState(false);
  const [settings, setSettings] = useState(EMPTY_SETTINGS);
  const ingestRef = useRef({ recorder: null, socket: null });
  const realtimeRef = useRef(null);

  const publicWatchUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const safeRoom = encodeURIComponent(String(roomCode || "live").trim());
    return `${window.location.origin}/watch/${safeRoom}`;
  }, [roomCode]);

  useEffect(() => {
    let cancelled = false;

    api("/api/broadcast/destinations")
      .then(data => {
        if (cancelled) return;

        setEncoderConnected(Boolean(data.encoderConnected));

        setSettings(current => {
          const next = { ...current };

          for (const item of data.destinations || []) {
            next[item.id] = {
              ...(next[item.id] || {}),
              url: item.url || "",
              key: "",
              configured: Boolean(item.configured),
              status: item.status || "configured"
            };
          }

          return next;
        });
      })
      .catch(error => {
        if (!cancelled) setStatus(error.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => {
    const { recorder, socket } = ingestRef.current;
    try { if (recorder?.state !== "inactive") recorder.stop(); } catch (_) {}
    try { socket?.close(); } catch (_) {}
    void realtimeRef.current?.stop?.();
  }, []);

  function chooseIngestMimeType() {
    const candidates = [
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp9,opus",
      "video/webm",
      "video/mp4"
    ];
    return candidates.find(type => MediaRecorder.isTypeSupported?.(type)) || "";
  }

  async function startBrowserIngest(ingest) {
    if (!ingest?.url || !ingest?.protocol) {
      throw new Error("Encoder did not return a secure ingest session.");
    }

    const stream = getProgramStream?.();
    if (!stream?.getVideoTracks?.().length) {
      throw new Error("Put a camera in Program before going live.");
    }

    if (typeof MediaRecorder === "undefined" || typeof WebSocket === "undefined") {
      throw new Error("This browser cannot send the Program feed to ScenePilot.");
    }

    const mimeType = chooseIngestMimeType();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 })
      : new MediaRecorder(stream, { videoBitsPerSecond: 4_000_000 });
    const socket = new WebSocket(ingest.url, ingest.protocol);
    socket.binaryType = "arraybuffer";

    await new Promise((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new Error("Urban Director Studio ingest connection timed out.")),
        12000
      );

      socket.onopen = () => {
        window.clearTimeout(timer);
        resolve();
      };
      socket.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("Urban Director Studio could not open the secure ingest connection."));
      };
    });

    recorder.ondataavailable = event => {
      if (event.data?.size && socket.readyState === WebSocket.OPEN) {
        socket.send(event.data);
      }
    };
    recorder.onerror = () => setStatus("Program ingest recorder failed.");
    socket.onclose = event => {
      if (event.code !== 1000 && ingestRef.current.socket === socket) {
        setStatus("Program ingest connection closed unexpectedly.");
        setBroadcasting(false);
      }
    };

    ingestRef.current = { recorder, socket };
    // Feed FFmpeg four times per second instead of making it wait for a full
    // one-second MediaRecorder slice before each WebSocket delivery.
    recorder.start(250);
  }

  async function stopBrowserIngest() {
    const { recorder, socket } = ingestRef.current;
    ingestRef.current = { recorder: null, socket: null };

    if (recorder?.state !== "inactive") {
      await new Promise(resolve => {
        const timer = window.setTimeout(resolve, 1500);
        recorder.addEventListener("stop", () => {
          window.clearTimeout(timer);
          resolve();
        }, { once: true });
        try { recorder.stop(); } catch (_) { resolve(); }
      });
    }

    await new Promise(resolve => window.setTimeout(resolve, 250));
    try { socket?.close(1000, "Broadcast stopped"); } catch (_) {}
  }

  const selectedNames = useMemo(
    () => DESTINATIONS
      .filter(destination => selected.includes(destination.id))
      .map(destination => destination.name),
    [selected]
  );

  function toggleDestination(id) {
    if (broadcasting) return;

    setSelected(current =>
      current.includes(id)
        ? current.filter(value => value !== id)
        : [...current, id]
    );
  }

  function updateSetting(id, field, value) {
    setSettings(current => ({
      ...current,
      [id]: {
        ...current[id],
        [field]: value
      }
    }));
  }

  async function saveDestination(id) {
    const item = settings[id] || {};

    const data = await api("/api/broadcast/destinations", {
      method: "POST",
      body: JSON.stringify({
        destinationId: id,
        url: item.url || "",
        streamKey: item.key || ""
      })
    });

    setSettings(current => ({
      ...current,
      [id]: {
        ...current[id],
        key: "",
        configured: true,
        status: "configured",
        url: data.destination?.url || current[id]?.url || ""
      }
    }));
  }

  async function saveSelected() {
    setSaving(true);
    setStatus("");

    try {
      for (const id of selected) {
        const item = settings[id] || {};

        if (!item.configured || item.key || item.url) {
          await saveDestination(id);
        }
      }

      setStatus("Selected destinations saved to this Urban Director Studio network.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function copyWatchLink() {
    if (!publicWatchUrl) return;

    try {
      await navigator.clipboard.writeText(publicWatchUrl);
      setShareStatus("WATCH LINK COPIED");
    } catch (_) {
      setShareStatus("COPY BLOCKED — USE SHARE");
    }
  }

  async function shareBroadcast() {
    if (!publicWatchUrl) return;

    const payload = {
      title: "Watch my live production",
      text: "I'm live now — watch here:",
      url: publicWatchUrl
    };

    try {
      if (navigator.share) {
        await navigator.share(payload);
        setShareStatus("SHARE SHEET OPENED");
      } else {
        await copyWatchLink();
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        setShareStatus("SHARE FAILED");
      }
    }
  }

  function shareToFacebook() {
    const url = encodeURIComponent(publicWatchUrl);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, "_blank", "noopener,noreferrer");
  }

  function shareToInstagram() {
    setShareStatus("INSTAGRAM: USE SHARE TO SEND THE WATCH LINK");
    shareBroadcast();
  }

  async function toggleBroadcast() {
    setStatus("");

    try {
      if (!broadcasting) {
        if (!selected.length) {
          setStatus("Select at least one destination.");
          return;
        }

        const missing = selected.filter(id => !settings[id]?.configured);
        if (missing.length) {
          setStatus("Configure and save every selected destination before going live.");
          setShowSettings(true);
          return;
        }

        const data = await api("/api/broadcast/start", {
          method: "POST",
          body: JSON.stringify({
            room: roomCode,
            destinations: selected
          })
        });

        try {
          await startBrowserIngest(data.encoder?.ingest);
        } catch (error) {
          await api("/api/broadcast/stop", {
            method: "POST",
            body: JSON.stringify({ room: roomCode, destinations: selected })
          }).catch(() => {});
          throw error;
        }

        try {
          realtimeRef.current = await publishProgramToRealtime(
            roomCode,
            getProgramStream?.()
          );
        } catch (error) {
          console.warn("Cloudflare Realtime unavailable; HLS remains active.", error);
          realtimeRef.current = null;
        }

        setBroadcasting(true);
        setShowShare(true);
        setStatus(data.status ? `Encoder: ${data.status}` : "Broadcast start accepted.");
      } else {
        await realtimeRef.current?.stop?.();
        realtimeRef.current = null;
        await stopBrowserIngest();
        const data = await api("/api/broadcast/stop", {
          method: "POST",
          body: JSON.stringify({
            room: roomCode,
            destinations: selected
          })
        });

        setBroadcasting(false);
        setStatus(data.status ? `Encoder: ${data.status}` : "Broadcast stop accepted.");
      }
    } catch (error) {
      setBroadcasting(false);
      setStatus(error.message);
    }
  }

  return (
    <section className="broadcast-panel">
      <div className="broadcast-head">
        <div>
          <span className="eyebrow">OUTPUT ROUTING</span>
          <strong>BROADCAST / MULTISTREAM</strong>
          <small>
            Each Urban Director Studio company keeps its own streaming destinations and credentials.
          </small>
        </div>

        <div className="broadcast-head-actions">
          <span className={`broadcast-backend-badge ${encoderConnected ? "ready" : ""}`}>
            <Server size={13}/>
            {encoderConnected ? "ENCODER CONNECTED" : "ENCODER BACKEND PENDING"}
          </span>
          <button onClick={() => setShowSettings(value => !value)}>
            <Settings2 size={15}/>
            {showSettings ? "HIDE SETTINGS" : "STREAM SETTINGS"}
          </button>
        </div>
      </div>

      <div className="broadcast-destinations">
        {DESTINATIONS.map(destination => {
          const Icon = destination.icon;
          const active = selected.includes(destination.id);
          const configured = Boolean(settings[destination.id]?.configured);

          return (
            <button
              key={destination.id}
              className={`broadcast-destination ${active ? "selected" : ""}`}
              onClick={() => toggleDestination(destination.id)}
              disabled={broadcasting}
            >
              <span className="destination-check">{active ? "✓" : ""}</span>
              <Icon size={22}/>
              <strong>{destination.name}</strong>
              <small>
                {configured ? "CONFIGURED" :
                  destination.kind === "self"
                    ? "YOUR OWN SERVER"
                    : destination.kind === "custom"
                      ? "ANY RTMP / RTMPS"
                      : "SETUP REQUIRED"}
              </small>
            </button>
          );
        })}
      </div>

      {showSettings && (
        <div className="broadcast-settings">
          <div className="broadcast-settings-head">
            <div>
              <span className="panel-label">CLIENT / NETWORK DESTINATIONS</span>
              <small>
                Paste the streaming URL and key supplied by this client's Facebook, Instagram,
                YouTube, Twitch, TikTok, self-hosted server, or other RTMP provider.
              </small>
            </div>
            <button onClick={() => setShowSecrets(value => !value)}>
              {showSecrets ? <EyeOff size={15}/> : <Eye size={15}/>}
              {showSecrets ? "HIDE NEW KEYS" : "SHOW NEW KEYS"}
            </button>
          </div>

          <div className="broadcast-setting-grid">
            {DESTINATIONS
              .filter(destination => selected.includes(destination.id))
              .map(destination => {
                const item = settings[destination.id] || {};

                return (
                  <div className="broadcast-setting-card" key={destination.id}>
                    <div className="broadcast-setting-title">
                      <strong>{destination.name}</strong>
                      {item.configured && (
                        <span><CheckCircle2 size={12}/> KEY SAVED</span>
                      )}
                    </div>

                    <label>
                      RTMP / RTMPS URL
                      <input
                        value={item.url || ""}
                        placeholder="Paste the client's streaming server URL"
                        onChange={event =>
                          updateSetting(destination.id, "url", event.target.value)
                        }
                      />
                    </label>

                    <label>
                      STREAM KEY
                      <input
                        type={showSecrets ? "text" : "password"}
                        value={item.key || ""}
                        placeholder={item.configured ? "Saved securely — enter only to replace" : "Paste client's stream key"}
                        onChange={event =>
                          updateSetting(destination.id, "key", event.target.value)
                        }
                      />
                    </label>

                    <button
                      className="broadcast-save-one"
                      disabled={saving || !item.url || (!item.configured && !item.key)}
                      onClick={() => {
                        setSaving(true);
                        setStatus("");
                        saveDestination(destination.id)
                          .then(() => setStatus(`${destination.name} saved for this Urban Director Studio network.`))
                          .catch(error => setStatus(error.message))
                          .finally(() => setSaving(false));
                      }}
                    >
                      <Save size={13}/> SAVE {destination.name.toUpperCase()}
                    </button>
                  </div>
                );
              })}
          </div>

          {!!selected.length && (
            <button className="broadcast-save-selected" disabled={saving} onClick={saveSelected}>
              <Save size={14}/> {saving ? "SAVING..." : "SAVE SELECTED DESTINATIONS"}
            </button>
          )}
        </div>
      )}

      <div className="broadcast-control-bar">
        <div className="broadcast-summary">
          <span>DESTINATIONS</span>
          <strong>
            {selectedNames.length
              ? selectedNames.join(" • ")
              : "NONE SELECTED"}
          </strong>
        </div>

        <div className="broadcast-engine-status">
          <i className={broadcasting ? "live" : encoderConnected ? "ready" : ""}/>
          <div>
            <span>ENCODER</span>
            <strong>
              {broadcasting
                ? "LIVE"
                : encoderConnected
                  ? "READY"
                  : "BACKEND PENDING"}
            </strong>
          </div>
        </div>

        <button
          className={`broadcast-go-live ${broadcasting ? "is-live" : ""}`}
          disabled={!selected.length}
          onClick={toggleBroadcast}
        >
          {broadcasting ? <Square size={17}/> : <Play size={17}/>}
          {broadcasting ? "END STREAM" : "GO LIVE"}
        </button>
      </div>

      {status && <div className="broadcast-status-message">{status}</div>}

      {showShare && (
        <section className="broadcast-share-panel">
          <div className="broadcast-share-copy">
            <span className="panel-label">PUBLIC WATCH ACCESS</span>
            <strong>SHARE YOUR LIVE BROADCAST</strong>
            <small>Send the QR code or watch link. Viewers open the link in their browser.</small>

            <div className="broadcast-watch-link">
              <input value={publicWatchUrl} readOnly aria-label="Public watch link"/>
              <button type="button" onClick={copyWatchLink}><Copy size={14}/> COPY</button>
            </div>

            <div className="broadcast-share-actions">
              <button type="button" onClick={shareBroadcast}><Share2 size={14}/> SHARE</button>
              <button type="button" onClick={shareToFacebook}><ExternalLink size={14}/> FACEBOOK</button>
              <button type="button" onClick={shareToInstagram}><ExternalLink size={14}/> INSTAGRAM</button>
              <button type="button" onClick={() => setShowShare(false)}><QrCode size={14}/> HIDE QR</button>
            </div>

            {shareStatus && <div className="broadcast-share-status">{shareStatus}</div>}
          </div>

          <div className="broadcast-qr-card">
            <QRCodeSVG
              value={publicWatchUrl || "https://example.com"}
              size={152}
              level="M"
              marginSize={2}
              title="Urban Director Studio public watch QR code"
            />
            <strong>SCAN TO WATCH</strong>
            <small>{roomCode}</small>
          </div>
        </section>
      )}

      {!showShare && (
        <button type="button" className="broadcast-open-share" onClick={() => setShowShare(true)}>
          <QrCode size={14}/> WATCH LINK / QR CODE
        </button>
      )}

      <div className="broadcast-future-note">
        <strong>HOW THIS IS WIRED:</strong>
        The client's saved destinations belong only to their Urban Director Studio network. GO LIVE now calls the
        Urban Director Studio encoder API with that network's decrypted stream targets. Once the Debian encoder URL
        is connected, it can publish the Program output to every checked destination.
      </div>
    </section>
  );
}
