import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import "./index.css";
import ScenePilotPortal from "./ScenePilotPortal.jsx";

function openScenePilotUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "scenepilot:" || url.hostname !== "camera") return;

    const cameraParams = new URLSearchParams({ camera: "1" });
    for (const key of ["network", "room", "join"]) {
      const item = url.searchParams.get(key);
      if (item && item.length <= 512) cameraParams.set(key, item);
    }
    window.location.assign(`/app?${cameraParams.toString()}`);
  } catch (error) {
    console.warn("ScenePilot ignored an invalid app link", error);
  }
}

if (Capacitor.isNativePlatform()) {
  void CapacitorApp.addListener("appUrlOpen", event => openScenePilotUrl(event.url));
  void CapacitorApp.getLaunchUrl()
    .then(result => {
      if (result?.url) openScenePilotUrl(result.url);
    })
    .catch(error => console.warn("ScenePilot could not read its launch URL", error));
}

createRoot(document.getElementById("root")).render(
  <ScenePilotPortal />
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .catch(error => console.warn("ScenePilot PWA service worker failed", error));
  });
}
