import { io } from "socket.io-client";

function getSignalUrl() {
  const { protocol, hostname } = window.location;

  // GitHub Codespaces
  if (hostname.endsWith(".app.github.dev")) {
    const signalHost = hostname.replace(
      /-5173\.app\.github\.dev$/,
      "-3001.app.github.dev"
    );

    return `${protocol}//${signalHost}`;
  }

  // Normal local development
  return `${protocol}//${hostname}:3001`;
}

export const SIGNAL_URL =
  import.meta.env.VITE_SIGNAL_URL || getSignalUrl();

console.log("ScenePilot signaling server:", SIGNAL_URL);

export const socket = io(SIGNAL_URL, {
  transports: ["websocket", "polling"],
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000
});
