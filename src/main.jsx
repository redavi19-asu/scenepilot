import { Component } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import "./index.css";\nimport "./urban-director-brand.css";
import ScenePilotPortal from "./ScenePilotPortal.jsx";

class UrbanDirectorErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Urban Director Studio render error", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#090b09",
          color: "#f3f4ef",
          fontFamily: "Inter, system-ui, sans-serif"
        }}
      >
        <section style={{ width: "min(560px, 100%)", textAlign: "center" }}>
          <h1 style={{ marginBottom: "12px" }}>Urban Director Studio hit a loading error.</h1>
          <p style={{ color: "#aeb5aa", lineHeight: 1.6 }}>
            Your account is still safe. Reload the studio to start a clean Director session.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: "18px",
              minHeight: "46px",
              padding: "0 22px",
              border: "1px solid #c99555",
              borderRadius: "10px",
              background: "#241b10",
              color: "#f5d7aa",
              fontWeight: 800
            }}
          >
            RELOAD URBAN DIRECTOR STUDIO
          </button>
        </section>
      </main>
    );
  }
}

function openScenePilotUrl(value, allowRepeat = false) {
  try {
    const url = new URL(value);
    if (url.protocol !== "scenepilot:" || url.hostname !== "camera") return;

    const cameraParams = new URLSearchParams({ camera: "1" });
    for (const key of ["network", "room", "join"]) {
      const item = url.searchParams.get(key);
      if (item && item.length <= 512) cameraParams.set(key, item);
    }
    const target = `/app?${cameraParams.toString()}`;
    const current = `${window.location.pathname}${window.location.search}`;
    const launchKey = `scenepilot:last-launch:${url.href}`;

    if (
      current === target ||
      (!allowRepeat && window.sessionStorage.getItem(launchKey) === "handled")
    ) {
      return;
    }

    window.sessionStorage.setItem(launchKey, "handled");
    window.location.replace(target);
  } catch (error) {
    console.warn("Urban Director Studio ignored an invalid app link", error);
  }
}

if (Capacitor.isNativePlatform()) {
  if ((window.location.pathname === "/" || !window.location.pathname) && !window.location.search) {
    window.history.replaceState({}, "", "/app");
  }

  void CapacitorApp.addListener("appUrlOpen", event => openScenePilotUrl(event.url, true));
  void CapacitorApp.getLaunchUrl()
    .then(result => {
      if (result?.url) openScenePilotUrl(result.url);
    })
    .catch(error => console.warn("Urban Director Studio could not read its launch URL", error));
}

createRoot(document.getElementById("root")).render(
  <UrbanDirectorErrorBoundary>
    <ScenePilotPortal />
  </UrbanDirectorErrorBoundary>
);

if (!Capacitor.isNativePlatform()) {
  window.addEventListener("load", () => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then(registrations =>
          Promise.all(registrations.map(registration => registration.unregister()))
        )
        .catch(error => console.warn("Urban Director Studio service worker cleanup failed", error));
    }

    if ("caches" in window) {
      caches.keys()
        .then(keys =>
          Promise.all(
            keys
              .filter(key => key.startsWith("urban-director-"))
              .map(key => caches.delete(key))
          )
        )
        .catch(error => console.warn("Urban Director Studio cache cleanup failed", error));
    }
  });
}
