import { useEffect, useMemo, useState } from "react";
import {
  RadioTower, Users, Camera, Video,
  Server, Settings2, Eye, EyeOff, Play, Square, Globe2, Save, CheckCircle2
} from "lucide-react";
import "./BroadcastPanel.css";

const DESTINATIONS = [
  { id: "facebook", name: "Facebook", icon: Users, kind: "external" },
  { id: "instagram", name: "Instagram", icon: Camera, kind: "external" },
  { id: "youtube", name: "YouTube", icon: Video, kind: "external" },
  { id: "twitch", name: "Twitch", icon: RadioTower, kind: "external" },
  { id: "tiktok", name: "TikTok", icon: RadioTower, kind: "external" },
  { id: "self", name: "ScenePilot Self-Hosted", icon: Server, kind: "self" },
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
    throw new Error(data.error || `ScenePilot broadcast request failed (HTTP ${response.status}).`);
  }

  return data;
}

export default function BroadcastPanel({ roomCode = "SP-4827" }) {
  const [selected, setSelected] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [encoderConnected, setEncoderConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [settings, setSettings] = useState(EMPTY_SETTINGS);

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

      setStatus("Selected destinations saved to this ScenePilot network.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSaving(false);
    }
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

        setBroadcasting(true);
        setStatus(data.status ? `Encoder: ${data.status}` : "Broadcast start accepted.");
      } else {
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
            Each ScenePilot company keeps its own streaming destinations and credentials.
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
                          .then(() => setStatus(`${destination.name} saved for this ScenePilot network.`))
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

      <div className="broadcast-future-note">
        <strong>HOW THIS IS WIRED:</strong>
        The client's saved destinations belong only to their ScenePilot network. GO LIVE now calls the
        ScenePilot encoder API with that network's decrypted stream targets. Once the Debian encoder URL
        is connected, it can publish the Program output to every checked destination.
      </div>
    </section>
  );
}
