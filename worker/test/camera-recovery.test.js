import test from "node:test";
import assert from "node:assert/strict";
import { ScenePilotRoom } from "../index.js";

function createRoom() {
  const room = new ScenePilotRoom({}, {});
  const messages = { director: [], camera: [], standby: [] };
  function session(id, role, canDirect = false) {
    return {
      id,
      role,
      canDirect,
      lastSeenAt: Date.now(),
      ws: { send: text => messages[id].push(JSON.parse(text)) }
    };
  }
  const director = session("director", "director", true);
  const camera = session("camera", "camera");
  const standby = session("standby", "standby");
  for (const value of [director, camera, standby]) room.sessions.set(value.id, value);
  room.activeDirectorId = director.id;
  room.cameras.set(camera.id, { socketId: camera.id, slotId: 1 });
  return { room, messages, director, camera, standby };
}

const signal = (room, from, event, payload = {}) =>
  room.handleMessage(from, JSON.stringify({ event, payload }));

test("registered camera can request a fresh offer from the active director", () => {
  const { room, messages, camera } = createRoom();
  signal(room, camera, "camera:request-offer");
  assert.deepEqual(messages.director, [{
    event: "camera:reoffer-requested",
    payload: { socketId: "camera" }
  }]);
});

test("camera recovery requests are rate-limited", () => {
  const { room, messages, camera } = createRoom();
  signal(room, camera, "camera:request-offer");
  signal(room, camera, "camera:request-offer");
  assert.equal(messages.director.length, 1);
});

test("standby users and unregistered cameras cannot request an offer", () => {
  const { room, messages, standby, camera } = createRoom();
  signal(room, standby, "camera:request-offer");
  room.cameras.delete(camera.id);
  signal(room, camera, "camera:request-offer");
  assert.equal(messages.director.length, 0);
});

test("media signaling is limited to the active director and its registered cameras", () => {
  const { room, messages, director, camera, standby } = createRoom();
  signal(room, standby, "webrtc:offer", { target: "camera", offer: { type: "offer" } });
  signal(room, camera, "webrtc:answer", { target: "standby", answer: { type: "answer" } });
  assert.equal(messages.camera.length, 0);
  assert.equal(messages.standby.length, 0);
  signal(room, director, "webrtc:offer", { target: "camera", offer: { type: "offer" } });
  signal(room, camera, "webrtc:answer", { target: "director", answer: { type: "answer" } });
  assert.equal(messages.camera.length, 1);
  assert.equal(messages.director.length, 1);
  assert.equal(messages.director[0].payload.from, "camera");
});
