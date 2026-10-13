import test from "node:test";
import assert from "node:assert/strict";
import { socket } from "../../src/socket.js";

test("an open WebSocket with missing heartbeat replies gets replaced", () => {
  const before = {
    WebSocket: globalThis.WebSocket,
    window: globalThis.window,
    document: globalThis.document,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval
  };
  let tick;
  const opened = [];
  class FakeWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.handlers = new Map();
      this.messages = [];
      opened.push(this);
    }
    addEventListener(name, handler) { this.handlers.set(name, handler); }
    fire(name, data) { this.handlers.get(name)?.(data || {}); }
    send(message) { this.messages.push(JSON.parse(message)); }
    close() { this.readyState = 3; this.fire("close"); }
  }

  globalThis.window = { location: { origin: "https://director.example.test" } };
  globalThis.document = { visibilityState: "visible" };
  globalThis.WebSocket = FakeWebSocket;
  globalThis.setInterval = fn => { tick = fn; return 123; };
  globalThis.clearInterval = () => {};

  try {
    socket.setNetwork("test-network", "test-invite");
    socket.setRoom("SP-4827");
    socket.connect();
    assert.equal(opened.length, 1);
    opened[0].readyState = FakeWebSocket.OPEN;
    opened[0].fire("open");
    assert.equal(typeof tick, "function");

    // A Cloudflare script upgrade can strand an OPEN browser socket forever.
    socket.lastPongAt = Date.now() - 31000;
    tick();
    assert.equal(opened.length, 2);
    assert.equal(socket.ws, opened[1]);
  } finally {
    socket.disconnect();
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
