import { createRoot } from "react-dom/client";
import "./index.css";
import ScenePilotPortal from "./ScenePilotPortal.jsx";

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
