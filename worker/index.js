export class ScenePilotRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
    this.cameras = new Map();
    this.activeDirectorId = null;
  }

  async fetch(request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("ScenePilot WebSocket endpoint", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();

    const session = {
      id: crypto.randomUUID(),
      ws: server,
      role: null
    };

    this.sessions.set(session.id, session);

    server.addEventListener("message", event => {
      this.handleMessage(session, event.data);
    });

    server.addEventListener("close", () => {
      this.removeSession(session);
    });

    server.addEventListener("error", () => {
      this.removeSession(session);
    });

    this.send(session, "session:ready", {
      socketId: session.id
    });

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  send(session, event, payload) {
    if (!session?.ws) return;

    try {
      session.ws.send(JSON.stringify({ event, payload }));
    } catch (_) {}
  }

  getActiveDirector() {
    if (!this.activeDirectorId) return null;
    return this.sessions.get(this.activeDirectorId) || null;
  }

  assignSlot(requestedSlot, sessionId) {
    const allowed = [7, 8, 9];

    const used = new Set(
      [...this.cameras.values()]
        .filter(camera => camera.socketId !== sessionId)
        .map(camera => camera.slotId)
    );

    const requested = Number(requestedSlot);

    if (allowed.includes(requested) && !used.has(requested)) {
      return requested;
    }

    return allowed.find(slot => !used.has(slot)) || 7;
  }

  handleMessage(session, raw) {
    let message;

    try {
      message = JSON.parse(raw);
    } catch (_) {
      return;
    }

    const event = message?.event;
    const payload = message?.payload || {};

    if (event === "director:join") {
      session.role = "director";
      this.activeDirectorId = session.id;

      this.send(
        session,
        "room:cameras",
        [...this.cameras.values()]
      );

      return;
    }

    if (event === "director:focus") {
      if (session.role === "director") {
        this.activeDirectorId = session.id;

        this.send(
          session,
          "room:cameras",
          [...this.cameras.values()]
        );
      }

      return;
    }

    if (event === "camera:join") {
      session.role = "camera";

      const slotId = this.assignSlot(
        payload.slotId,
        session.id
      );

      const camera = {
        socketId: session.id,
        name: payload.name || "ROAMING 1",
        connected: true,
        slotId
      };

      this.cameras.set(session.id, camera);

      const director = this.getActiveDirector();

      if (director) {
        this.send(director, "camera:joined", camera);
      }

      this.send(session, "camera:registered", {
        slotId,
        directorAvailable: Boolean(director)
      });

      return;
    }

    if (
      event === "webrtc:offer" ||
      event === "webrtc:answer" ||
      event === "webrtc:ice"
    ) {
      const target = this.sessions.get(payload.target);
      if (!target) return;

      const forwarded = {
        ...payload,
        from: session.id
      };

      delete forwarded.target;

      this.send(target, event, forwarded);
    }
  }

  removeSession(session) {
    if (!this.sessions.has(session.id)) return;

    this.sessions.delete(session.id);

    if (session.role === "camera") {
      this.cameras.delete(session.id);

      for (const candidate of this.sessions.values()) {
        if (candidate.role === "director") {
          this.send(candidate, "camera:left", {
            socketId: session.id
          });
        }
      }
    }

    if (this.activeDirectorId === session.id) {
      this.activeDirectorId = null;

      const standby = [...this.sessions.values()]
        .find(candidate => candidate.role === "director");

      if (standby) {
        this.activeDirectorId = standby.id;
        this.send(
          standby,
          "room:cameras",
          [...this.cameras.values()]
        );
      }
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/signal") {
      const room =
        url.searchParams.get("room") || "SP-4827";

      const id = env.ROOMS.idFromName(room);
      const roomObject = env.ROOMS.get(id);

      return roomObject.fetch(request);
    }

    return env.ASSETS.fetch(request);
  }
};
