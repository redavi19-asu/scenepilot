import test from "node:test";
import assert from "node:assert/strict";
import { ScenePilotRoom } from "../index.js";

test("a paused Director can rejoin using its original WebSocket", () => {
  const room = new ScenePilotRoom({}, {});
  const sent = [];
  const director = {
    id: "director", role: "director", canDirect: true,
    userId: "owner", lastSeenAt: Date.now() - 100000,
    ws: { send: message => sent.push(JSON.parse(message)) }
  };
  room.sessions.set(director.id, director);
  room.activeDirectorId = director.id;
  assert.equal(room.getActiveDirector(), null);
  assert.equal(room.sessions.has(director.id), true);
  room.handleMessage(director, JSON.stringify({ event: "director:join", payload: {} }));
  assert.equal(room.activeDirectorId, director.id);
  assert.ok(sent.some(item => item.event === "director:granted"));
});

test("heartbeat receives an acknowledgement", () => {
  const room = new ScenePilotRoom({}, {});
  const sent = [];
  const director = {
    id: "director", role: "director", canDirect: true,
    userId: "owner", lastSeenAt: Date.now(),
    ws: { send: message => sent.push(JSON.parse(message)) }
  };
  room.sessions.set(director.id, director);
  room.activeDirectorId = director.id;
  room.handleMessage(director, JSON.stringify({ event: "session:heartbeat" }));
  assert.equal(sent[0].event, "session:pong");
});
