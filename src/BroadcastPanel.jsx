import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  RadioTower, Users, Camera, Video,
  Server, Settings2, Eye, EyeOff, Play, Square, Globe2, Save, CheckCircle2,
  Copy, Share2, QrCode, ExternalLink, ChevronDown, ChevronUp, AlertTriangle, Clock3
} from "lucide-react";
import { publishProgramToRealtime } from "./cloudflareRealtime";
import { apiFetch, publicOrigin } from "./runtimeApi";
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
  const response = await apiFetch(path, {
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
  const [usage, setUsage] = useState(null);
  const [broadcastNetworkId, setBroadcastNetworkId] = useState("");
  const [collapsed, setCollapsed] = useState(() => (
    typeof window !== "undefined" &&
    Boolean(window.matchMedia?.("(max-width: 760px)")?.matches)
  ));
  const ingestRef = useRef({ recorder: null, socket: null });
  const realtimeRef = useRef(null);
  const limitTimerRef = useRef(null);
  const usageAlertRef = useRef("");

  const usagePercent = useMemo(() => {
    if (!usage?.includedMinutes) return 0;
    return Math.min(100, Math.round((Number(usage.usedMinutes || 0) / Number(usage.includedMinutes)) * 100));
  }, [usage]);

  const usageLevel =
    usagePercent >= 100 ? "critical" :
    usagePercent >= 90 ? "danger" :
    usagePercent >= 75 ? "warning" :
    "normal";

  const serviceRoomCode = useMemo(() => {
    const baseRoom = String(roomCode || "live")
      .trim()
      .replace(/[^A-Za-z0-9_-]/g, "")
      .slice(0, 32) || "live";
    const networkRoom = String(broadcastNetworkId || "")
      .trim()
      .replace(/[^A-Za-z0-9_-]/g, "")
      .slice(0, 40);
    return networkRoom ? `${baseRoom}-${networkRoom}`.slice(0, 80) : baseRoom;
  }, [roomCode, broadcastNetworkId]);

  const publicWatchUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${publicOrigin()}/watch/${encodeURIComponent(serviceRoomCode)}`;
  }, [serviceRoomCode]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const media = window.matchMedia("(max-width: 760px)");
    const handleViewportChange = event => {
      if (!event.matches) setCollapsed(false);
    };
    media.addEventListener?.("change", handleViewportChange);
    return () => media.removeEventListener?.("change", handleViewportChange);
  }, []);

  useEffect(() => {
    let cancelled = false;

    api("/api/broadcast/destinations")
      .then(data => {
        if (cancelled) return;

        setEncoderConnected(Boolean(data.encoderConnected));
        setBroadcastNetworkId(String(data.network?.id || ""));

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

  useEffect(() => {
    let cancelled = false;

    api("/api/broadcast/usage")
      .then(data => {
        if (!cancelled) setUsage(data.usage || null);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!broadcasting) return undefined;

    const refresh = () => {
      api("/api/broadcast/usage")
        .then(data => setUsage(data.usage || null))
        .catch(() => {});
    };

    refresh();
    const interval = window.setInterval(refresh, 60 * 1000);
    return () => window.clearInterval(interval);
  }, [broadcasting]); // usage-refresh

  useEffect(() => {
    if (!broadcasting || !usage) return;

    const nextAlert =
      usagePercent >= 100 ? "limit" :
      usagePercent >= 90 ? "urgent" :
      usagePercent >= 75 ? "warning" :
      "";

    if (!nextAlert || usageAlertRef.current === nextAlert) return;
    usageAlertRef.current = nextAlert;

    if (nextAlert === "limit") {
      setStatus("Monthly broadcast allowance reached. Local / ISO recording can continue.");
    } else if (nextAlert === "urgent") {
      setStatus(`Streaming warning: only ${usage.remainingMinutes} broadcast minutes remain this month.`);
    } else {
      setStatus(`Streaming notice: ${usage.remainingMinutes} broadcast minutes remain this month.`);
    }
  }, [broadcasting, usage, usagePercent]);

  useEffect(() => () => {
    const { recorder, socket } = ingestRef.current;
    try { if (recorder?.state !== "inactive") recorder.stop(); } catch {}
    try { socket?.close(); } catch {}
    if (limitTimerRef.current) window.clearTimeout(limitTimerRef.current);
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
      throw new Error("This browser cannot send the Program feed to Urban Director Studio.");
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
      if (ingestRef.current.socket !== socket) return;

      if (event.code === 4008) {
        void realtimeRef.current?.stop?.();
        realtimeRef.current = null;
        setStatus("Streaming limit reached. Start another session if monthly minutes remain.");
        setBroadcasting(false);
        return;
      }

      if (event.code !== 1000) {
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
        try { recorder.stop(); } catch { resolve(); }
      });
    }

    await new Promise(resolve => window.setTimeout(resolve, 250));
    try { socket?.close(1000, "Broadcast stopped"); } catch {}
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
    } catch {
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
        if (!broadcastNetworkId) {
          setStatus("Production network is still loading. Try again in a moment.");
          return;
        }

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
            room: serviceRoomCode,
            destinations: selected
          })
        });

        try {
          await startBrowserIngest(data.encoder?.ingest);
        } catch (error) {
          await api("/api/broadcast/stop", {
            method: "POST",
            body: JSON.stringify({ room: serviceRoomCode, destinations: selected })
          }).catch(() => {});
          throw error;
        }

        if (selected.includes("self")) {
          try {
            realtimeRef.current = await publishProgramToRealtime(
              serviceRoomCode,
              getProgramStream?.()
            );
          } catch (error) {
            console.warn("Cloudflare Realtime unavailable; HLS remains active.", error);
            realtimeRef.current = null;
          }
        } else {
          realtimeRef.current = null;
        }

        usageAlertRef.current = "";
        setBroadcasting(true);
        setShowShare(true);

        const sessionLimitSeconds = Number(
          data.usage?.sessionLimitSeconds || data.encoder?.maxDurationSeconds || 0
        );
        if (limitTimerRef.current) window.clearTimeout(limitTimerRef.current);
        if (sessionLimitSeconds > 0) {
          limitTimerRef.current = window.setTimeout(async () => {
            await realtimeRef.current?.stop?.();
            realtimeRef.current = null;
            await stopBrowserIngest().catch(() => {});
            await api("/api/broadcast/stop", {
              method: "POST",
              body: JSON.stringify({ room: serviceRoomCode, destinations: selected })
            }).catch(() => {});
            setBroadcasting(false);
            setStatus("Streaming session limit reached. Start another session if monthly minutes remain.");
          }, sessionLimitSeconds * 1000);
        }

        if (data.usage) setUsage(data.usage);
        const remaining = data.usage?.remainingMinutes;
        setStatus(
          data.status
            ? `Encoder: ${data.status}${Number.isFinite(remaining) ? ` · ${remaining} monthly minutes remaining` : ""}`
            : "Broadcast start accepted."
        );
      } else {
        if (limitTimerRef.current) {
          window.clearTimeout(limitTimerRef.current);
          limitTimerRef.current = null;
        }
        await realtimeRef.current?.stop?.();
        realtimeRef.current = null;
        await stopBrowserIngest();
        const data = await api("/api/broadcast/stop", {
          method: "POST",
          body: JSON.stringify({
            room: serviceRoomCode,
            destinations: selected
          })
        });

        setBroadcasting(false);
        usageAlertRef.current = "";
        const refreshed = await api("/api/broadcast/usage").catch(() => null);
        if (refreshed?.usage) setUsage(refreshed.usage);
        setStatus(data.status ? `Encoder: ${data.status}` : "Broadcast stop accepted.");
      }
    } catch (error) {
      if (limitTimerRef.current) {
        window.clearTimeout(limitTimerRef.current);
        limitTimerRef.current = null;
      }
      setBroadcasting(false);
      setStatus(error.message);
    }
  }

  return (
    <section className={`broadcast-panel ${collapsed ? "mobile-collapsed" : ""}`}>
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
          <button
            type="button"
            className="broadcast-mobile-collapse-toggle"
            onClick={() => setCollapsed(value => !value)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Open broadcast multistream" : "Close broadcast multistream"}
          >
            {collapsed ? <ChevronDown size={15}/> : <ChevronUp size={15}/>}
            {collapsed ? "OPEN" : "CLOSE"}
          </button>
        </div>
      </div>

      {usage && (
        <div className={`broadcast-usage-card ${usageLevel}`}>
          <div className="broadcast-usage-topline">
            <div>
              {usageLevel === "normal" ? <Clock3 size={17}/> : <AlertTriangle size={17}/>}
              <strong>MONTHLY BROADCAST ALLOWANCE</strong>
            </div>
            <span>{usage.remainingMinutes} / {usage.includedMinutes} MIN REMAINING</span>
          </div>

          <div className="broadcast-usage-meter" aria-label={`${usagePercent}% of monthly streaming used`}>
            <i style={{ width: `${usagePercent}%` }}/>
          </div>

          <small>
            {usagePercent >= 100
              ? "Hosted live streaming is paused until the monthly allowance resets. You can still record locally / ISO without using hosted streaming minutes."
              : usagePercent >= 90
                ? "You are almost out of broadcast time. Finish critical live events first. Local / ISO recording can continue without using hosted streaming minutes."
                : usagePercent >= 75
                  ? "Streaming allowance is getting low. For long productions, record locally when you do not need a live audience."
                  : "Broadcast allowance and local recording are separate. Recording locally / ISO does not reduce this monthly streaming allowance."}
          </small>

          <details className="broadcast-usage-help">
            <summary>How do I keep working if I am running low?</summary>
            <p>
              Stop the hosted broadcast when you do not need to be live and continue recording locally.
              Save long recordings in shorter segments so the device can release its active recording buffer.
              Move finished files to Files, Photos, cloud storage, or an external drive and remove old local copies.
              If your production regularly needs more hosted live time, use a higher-capacity plan when available.
            </p>
          </details>
        </div>
      )}

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
            <small>{serviceRoomCode}</small>
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
