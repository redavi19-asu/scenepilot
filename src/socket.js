import { io } from "socket.io-client";

const SIGNAL_URL =
  import.meta.env.VITE_SIGNAL_URL ||
  `${window.location.protocol}//${window.location.hostname}:3001`;

export const socket = io(SIGNAL_URL, {
  transports: ["websocket", "polling"],
  autoConnect: false
});
