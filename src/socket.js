class ScenePilotSocket {
  constructor() {
    this.ws = null;
    this.room = null;
    this.listeners = new Map();
    this.queue = [];
    this.wantConnected = false;
    this.manualClose = false;
    this.reconnectTimer = null;
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
        console.error(`ScenePilot listener error [${event}]`, error);
      }
    });
  }

  connect() {
    this.wantConnected = true;
    this.manualClose = false;

    if (this.room) {
      this.open();
    }

    return this;
  }

  open() {
    if (!this.wantConnected || !this.room) return;

    if (
      this.ws &&
      (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      )
    ) {
      return;
    }

    const protocol =
      window.location.protocol === "https:" ? "wss:" : "ws:";

    const url =
      `${protocol}//${window.location.host}/signal?room=${encodeURIComponent(this.room)}`;

    const ws = new WebSocket(url);
    this.ws = ws;

    ws.addEventListener("open", () => {
      if (this.ws !== ws) return;

      this.dispatch("connect");
      const pending = [...this.queue];
      this.queue = [];

      pending.forEach(message => {
        ws.send(JSON.stringify(message));
      });
    });

    ws.addEventListener("message", event => {
      if (this.ws !== ws) return;

      try {
        const message = JSON.parse(event.data);
        if (!message?.event) return;
        this.dispatch(message.event, message.payload);
      } catch (error) {
        console.error("ScenePilot signaling message error", error);
      }
    });

    ws.addEventListener("close", () => {
      if (this.ws === ws) {
        this.ws = null;
      }

      this.dispatch("disconnect");

      if (!this.manualClose && this.wantConnected && this.room) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.open(), 1200);
      }
    });

    ws.addEventListener("error", error => {
      console.error("ScenePilot signaling socket error", error);
    });
  }

  emit(event, payload = {}) {
    if (payload?.room && !this.room) {
      this.room = payload.room;
    }

    const message = { event, payload };

    if (this.connected) {
      this.ws.send(JSON.stringify(message));
      return this;
    }

    this.queue.push(message);

    if (this.wantConnected && this.room) {
      this.open();
    }

    return this;
  }

  disconnect() {
    this.manualClose = true;
    this.wantConnected = false;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.queue = [];

    if (this.ws) {
      try {
        this.ws.close(1000, "ScenePilot client disconnect");
      } catch (_) {}
    }

    this.ws = null;
    return this;
  }
}

export const socket = new ScenePilotSocket();
