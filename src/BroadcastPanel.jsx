import { useMemo, useState } from "react";
import {
  RadioTower, Facebook, Youtube, Twitch, Instagram,
  Server, Settings2, Eye, EyeOff, Play, Square, Globe2
} from "lucide-react";
import "./BroadcastPanel.css";

const DESTINATIONS = [
  { id: "facebook", name: "Facebook", icon: Facebook, kind: "external" },
  { id: "instagram", name: "Instagram", icon: Instagram, kind: "external" },
  { id: "youtube", name: "YouTube", icon: Youtube, kind: "external" },
  { id: "twitch", name: "Twitch", icon: Twitch, kind: "external" },
  { id: "tiktok", name: "TikTok", icon: RadioTower, kind: "external" },
  { id: "self", name: "ScenePilot Self-Hosted", icon: Server, kind: "self" },
  { id: "custom", name: "Custom RTMP", icon: Globe2, kind: "custom" }
];

export default function BroadcastPanel() {
  const [selected, setSelected] = useState(["self"]);
  const [showSettings, setShowSettings] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [settings, setSettings] = useState({
    facebook: { url: "", key: "" },
    instagram: { url: "", key: "" },
    youtube: { url: "", key: "" },
    twitch: { url: "", key: "" },
    tiktok: { url: "", key: "" },
    custom: { url: "", key: "" },
    self: {
      url: "rtmp://YOUR-DEBIAN-SERVER/live",
      key: "scenepilot-program"
    }
  });

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

  return (
    <section className="broadcast-panel">
      <div className="broadcast-head">
        <div>
          <span className="eyebrow">OUTPUT ROUTING</span>
          <strong>BROADCAST / MULTISTREAM</strong>
          <small>
            Choose one or more destinations. Debian will power the live encoder backend.
          </small>
        </div>

        <div className="broadcast-head-actions">
          <span className="broadcast-backend-badge">
            <Server size={13}/>
            DEBIAN BACKEND PENDING
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
                {destination.kind === "self"
                  ? "YOUR OWN SERVER"
                  : destination.kind === "custom"
                    ? "ANY RTMP / RTMPS"
                    : "SOCIAL PLATFORM"}
              </small>
            </button>
          );
        })}
      </div>

      {showSettings && (
        <div className="broadcast-settings">
          <div className="broadcast-settings-head">
            <div>
              <span className="panel-label">DESTINATION SETTINGS</span>
              <small>Stream keys stay masked on screen. Debian connection comes next.</small>
            </div>
            <button onClick={() => setShowSecrets(value => !value)}>
              {showSecrets ? <EyeOff size={15}/> : <Eye size={15}/>}
              {showSecrets ? "HIDE KEYS" : "SHOW KEYS"}
            </button>
          </div>

          <div className="broadcast-setting-grid">
            {DESTINATIONS
              .filter(destination => selected.includes(destination.id))
              .map(destination => (
                <div className="broadcast-setting-card" key={destination.id}>
                  <strong>{destination.name}</strong>

                  <label>
                    RTMP / RTMPS URL
                    <input
                      value={settings[destination.id]?.url || ""}
                      placeholder={
                        destination.id === "self"
                          ? "rtmp://your-debian-server/live"
                          : "Paste destination URL"
                      }
                      onChange={event =>
                        updateSetting(destination.id, "url", event.target.value)
                      }
                    />
                  </label>

                  <label>
                    STREAM KEY
                    <input
                      type={showSecrets ? "text" : "password"}
                      value={settings[destination.id]?.key || ""}
                      placeholder="Paste stream key"
                      onChange={event =>
                        updateSetting(destination.id, "key", event.target.value)
                      }
                    />
                  </label>

                  {destination.id === "self" && (
                    <div className="self-host-note">
                      <Server size={15}/>
                      <span>
                        Tomorrow this points to the ScenePilot ingest service on your Debian Trixie machine.
                      </span>
                    </div>
                  )}
                </div>
              ))}
          </div>
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
          <i className={broadcasting ? "live" : ""}/>
          <div>
            <span>ENCODER</span>
            <strong>{broadcasting ? "LIVE" : "WAITING FOR DEBIAN"}</strong>
          </div>
        </div>

        <button
          className={`broadcast-go-live ${broadcasting ? "is-live" : ""}`}
          disabled={!selected.length}
          onClick={() => setBroadcasting(value => !value)}
          title="Control is staged now; actual external streaming will activate when the Debian encoder backend is connected."
        >
          {broadcasting ? <Square size={17}/> : <Play size={17}/>}
          {broadcasting ? "END STREAM" : "GO LIVE"}
        </button>
      </div>

      <div className="broadcast-future-note">
        <strong>BACKEND READY POINT:</strong>
        This panel is the control surface. The Debian server will receive the ScenePilot Program output,
        encode it with FFmpeg, and publish it to every selected destination — including your own ScenePilot stream.
      </div>
    </section>
  );
}
