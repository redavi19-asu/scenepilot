import { io } from "socket.io-client";

function getSignalUrl() {
  const { protocol, hostname } = window.location;

  // GitHub Codespaces:
  // xxxx-5173.app.github.dev -> xxxx-3001.app.github.dev
  if (hostname.endsWith(".app.github.dev")) {
    const signalHost = hostname.replace(
      /-5173\.app\.github\.dev$/,
      "-3001.app.github.dev"
    );

    return `${protocol}//${signalHost}`;
  }

  // Local development
  return `${protocol}//${hostname}:3001`;
}

export const SIGNAL_URL =
  import.meta.env.VITE_SIGNAL_URL || getSignalUrl();

console.log("ScenePilot signaling:", SIGNAL_URL);

export const socket = io(SIGNAL_URL, {
  transports: ["websocket", "polling"],
  autoConnect: false
});
