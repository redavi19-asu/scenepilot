import { signalUrl } from "./runtimeApi";

class ScenePilotSocket {
  constructor() {
    this.ws = null;
    this.room = null;
    this.network = null;
    this.joinToken = null;
    this.signalTicket = null;
    this.listeners = new Map();
    this.queue = [];
    this.wantConnected = false;
    this.manualClose = false;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.role = null;
    this.lastPongAt = 0;
    this.lastForegroundAt = 0;
    this.wasBackgroundedAt = 0;
    this.openedFor = null;
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          this.wasBackgroundedAt = Date.now();
        } else {
          this.restoreForeground();
        }
      });
      window.addEventListener("focus", () => this.restoreForeground());
    }
  }

  restoreForeground() {
    if (!this.wantConnected || !this.network || !this.room) return;
    const now = Date.now();
    if (now - this.lastForegroundAt < 1500) return;
    this.lastForegroundAt = now;

    // Safari may leave a stale OPEN socket after sleeping. Renew the room
    // session and refresh Director/camera presence after a long suspension.
    if (!this.connected || (this.wasBackgroundedAt && now - this.wasBackgroundedAt > 10000) ||
        (this.lastPongAt && now - this.lastPongAt > 20000)) {
      this.reconnect();
    } else if (this.role === "director") {
      this.emit("director:join", { room: this.room });
    } else if (this.role === "camera") {
      this.emit("camera:join", { room: this.room });
    }
    this.wasBackgroundedAt = 0;
  }

  reconnect() {
    if (!this.wantConnected) return this;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.heartbeatTimer);
    const prior = this.ws;
    this.ws = null;
    this.openedFor = null;
    try { prior?.close(1000, "Refreshing Director signaling session"); } catch {}
    this.open();
    return this;
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(handler);
    return this;
  }

  off(event, handler) {
    if (!event) {
      this.listeners.clear();
      return this;
    }

    if (!handler) {
      this.listeners.delete(event);
      return this;
    }

    this.listeners.get(event)?.delete(handler);
    return this;
  }

  dispatch(event, payload) {
    this.listeners.get(event)?.forEach(handler => {
      try {
        handler(payload);
      } catch (error) {
        console.error(`Urban Director Studio listener error [${event}]`, error);
      }
    });
  }

  setRoom(room) {
    this.room = room || null;
    return this;
  }

  setNetwork(network, joinToken = null, signalTicket = null) {
    this.network = network || null;
    this.joinToken = joinToken || null;
    this.signalTicket = signalTicket || null;
    return this;
  }

  connect() {
    this.wantConnected = true;
    this.manualClose = false;

    if (this.room && this.network) {
      this.open();
    }

    return this;
  }

  open() {
    if (!this.wantConnected || !this.room || !this.network) return;
    const connectionKey = [this.room, this.network].join(":");
    if (this.ws && this.openedFor && this.openedFor !== connectionKey) {
      this.reconnect();
      return;
    }

    if (
      this.ws &&
      (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      )
    ) {
      return;
    }

    const url = signalUrl({
      room: this.room,
      network: this.network,
      joinToken: this.joinToken,
      signalTicket: this.signalTicket
    });

    const ws = new WebSocket(url);
    this.ws = ws;
    this.openedFor = connectionKey;

    ws.addEventListener("open", () => {
      if (this.ws !== ws) return;

      this.lastPongAt = Date.now();
      this.dispatch("connect");
      const pending = [...this.queue];
      this.queue = [];

      pending.forEach(message => {
        ws.send(JSON.stringify(message));
      });

      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = setInterval(() => {
        if (this.ws !== ws || ws.readyState !== WebSocket.OPEN) return;
        // When a Cloudflare Worker/room upgrades, Safari can leave an
        // apparently OPEN socket that never receives another message.
        // Force a new authenticated room join rather than leaving cameras
        // invisible to Director indefinitely. Ignore backgrounded tabs:
        // restoreForeground handles their recovery on resume.
        if (document.visibilityState !== "hidden" &&
            this.lastPongAt &&
            Date.now() - this.lastPongAt > 25000) {
          console.warn("Urban Director Studio signaling heartbeat expired; reconnecting.");
          this.dispatch("disconnect");
          this.reconnect();
          return;
        }
        try {
          ws.send(JSON.stringify({
            event: "session:heartbeat",
            payload: { ts: Date.now() }
          }));
        } catch (error) {
          console.warn("Urban Director Studio heartbeat failed; reconnecting.", error);
          this.reconnect();
        }
      }, 5000);
    });

    ws.addEventListener("message", event => {
      if (this.ws !== ws) return;

      try {
        const message = JSON.parse(event.data);
        if (!message?.event) return;
        if (message.event === "session:pong") {
          this.lastPongAt = Date.now();
          return;
        }
        this.dispatch(message.event, message.payload);
      } catch (error) {
        console.error("Urban Director Studio signaling message error", error);
      }
    });

    ws.addEventListener("close", () => {
      // An old socket may close *after* its replacement connects.
      // Never report a phantom disconnection for that obsolete socket.
      if (this.ws !== ws) return;
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      this.ws = null;
      this.openedFor = null;
      this.dispatch("disconnect");

      if (!this.manualClose && this.wantConnected && this.room && this.network) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.open(), 1200);
      }
    });

    ws.addEventListener("error", error => {
      console.error("Urban Director Studio signaling socket error", error);
    });
  }

  emit(event, payload = {}) {
    if (event === "director:join") this.role = "director";
    if (event === "camera:join") this.role = "camera";
    if (payload?.room && !this.room) {
      this.room = payload.room;
    }

    const message = { event, payload };

    if (this.connected) {
      this.ws.send(JSON.stringify(message));
      return this;
    }

    this.queue.push(message);

    if (this.wantConnected && this.room && this.network) {
      this.open();
    }

    return this;
  }

  disconnect() {
    this.manualClose = true;
    this.wantConnected = false;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.heartbeatTimer);
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.queue = [];
    this.role = null;
    this.openedFor = null;

    if (this.ws) {
      try {
        this.ws.close(1000, "Urban Director Studio client disconnect");
      } catch {}
    }

    this.ws = null;
    return this;
  }
}

export const socket = new ScenePilotSocket();
