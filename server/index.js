import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = new Map();

app.get("/", (req, res) => {
  res.send(`
    <!doctype html>
    <html>
      <head>
        <title>ScenePilot Signal Server</title>
        <style>
          body {
            margin: 0;
            height: 100vh;
            display: grid;
            place-items: center;
            background: #111;
            color: #eee;
            font-family: Arial, sans-serif;
          }

          .box {
            padding: 32px 42px;
            border: 1px solid #555;
            background: #1b1b1b;
            border-radius: 12px;
            text-align: center;
          }

          .online {
            color: #8fd18f;
          }

          small {
            color: #999;
          }
        </style>
      </head>

      <body>
        <div class="box">
          <h1>SCENEPILOT</h1>
          <h2 class="online">SIGNAL SERVER ONLINE</h2>
          <small>WebRTC coordination service • 3001</small>
        </div>
      </body>
    </html>
  `);
});

io.on("connection", socket => {
  console.log("CONNECTED:", socket.id);

  socket.on("director:join", ({ room }) => {
    socket.join(room);

    socket.data.room = room;
    socket.data.role = "director";

    if (!rooms.has(room)) {
      rooms.set(room, new Map());
    }

    const cameras = [
      ...rooms.get(room).values()
    ];

    socket.emit(
      "room:cameras",
      cameras
    );

    for (const cameraSocketId of io.sockets.adapter.rooms.get(room) || []) {
      const cameraSocket = io.sockets.sockets.get(cameraSocketId);
      if (cameraSocket?.data?.role === "camera") {
        cameraSocket.emit("intercom:director", {
          directorId: socket.id
        });
      }
    }

    console.log(
      "DIRECTOR JOINED:",
      room,
      socket.id
    );
  });

  socket.on("director:focus", ({ room }) => {
    if (socket.data.role !== "director") return;

    const targetRoom = room || socket.data.room;
    if (!targetRoom || !rooms.has(targetRoom)) return;

    socket.emit(
      "room:cameras",
      [...rooms.get(targetRoom).values()]
    );
  });

  socket.on(
    "camera:join",
    ({ room, name, slotId }) => {
      socket.join(room);

      socket.data.room = room;
      socket.data.role = "camera";

      if (!rooms.has(room)) {
        rooms.set(room, new Map());
      }

      const roomCameras = rooms.get(room);
      const usedSlots = new Set(
        [...roomCameras.values()]
          .map(camera => Number(camera.slotId))
          .filter(Number.isFinite)
      );
      const preferredSlot = Number(slotId);
      const slotOrder = [7, 8, 9, 1, 2, 3, 4, 5, 6];
      const assignedSlot =
        (Number.isFinite(preferredSlot) && !usedSlots.has(preferredSlot) && preferredSlot) ||
        slotOrder.find(candidate => !usedSlots.has(candidate)) ||
        preferredSlot ||
        null;

      const camera = {
        socketId: socket.id,
        name: name || "WIRELESS CAMERA",
        slotId: assignedSlot,
        connected: true,
        battery: null,
        charging: null,
        network: null,
        telemetryConsent: false,
        telemetrySupport: null
      };

      rooms
        .get(room)
        .set(socket.id, camera);

      socket
        .to(room)
        .emit(
          "camera:joined",
          camera
        );

      const directorSocketId = [...io.sockets.adapter.rooms.get(room) || []]
        .find(id => io.sockets.sockets.get(id)?.data?.role === "director");

      socket.emit("camera:registered", {
        slotId: camera.slotId,
        directorAvailable: Boolean(directorSocketId)
      });

      socket.emit("intercom:director", {
        directorId: directorSocketId || null
      });

      console.log(
        "CAMERA JOINED:",
        room,
        socket.id
      );
    }
  );

  socket.on("camera:telemetry", payload => {
    if (socket.data.role !== "camera") return;

    const room = payload?.room || socket.data.room;
    if (!room || !rooms.has(room)) return;

    const camera = rooms.get(room).get(socket.id);
    if (!camera) return;

    camera.telemetryConsent = payload?.telemetryConsent === true;
    camera.telemetrySupport =
      payload?.support && typeof payload.support === "object"
        ? {
            battery: Boolean(payload.support.battery),
            network: Boolean(payload.support.network)
          }
        : null;

    camera.battery =
      camera.telemetryConsent && Number.isFinite(payload?.battery)
        ? Math.max(0, Math.min(100, Number(payload.battery)))
        : null;

    camera.charging =
      camera.telemetryConsent && typeof payload?.charging === "boolean"
        ? payload.charging
        : null;

    camera.network =
      camera.telemetryConsent &&
      payload?.network &&
      typeof payload.network === "object"
        ? {
            bars: Number.isFinite(payload.network.bars)
              ? Math.max(1, Math.min(4, Number(payload.network.bars)))
              : null,
            downlink: Number.isFinite(payload.network.downlink)
              ? Number(payload.network.downlink)
              : null,
            rtt: Number.isFinite(payload.network.rtt)
              ? Number(payload.network.rtt)
              : null,
            effectiveType: payload.network.effectiveType
              ? String(payload.network.effectiveType).slice(0, 20)
              : null
          }
        : null;

    socket.to(room).emit("camera:telemetry", {
      socketId: socket.id,
      battery: camera.battery,
      charging: camera.charging,
      network: camera.network,
      telemetryConsent: camera.telemetryConsent,
      support: camera.telemetrySupport
    });
  });

  socket.on("camera:control", ({ room, target, command, action, direction }) => {
    if (socket.data.role !== "director") return;

    const targetRoom = room || socket.data.room;
    if (!targetRoom || !target) return;

    const targetSocket = io.sockets.sockets.get(target);
    if (
      !targetSocket ||
      targetSocket.data.role !== "camera" ||
      targetSocket.data.room !== targetRoom
    ) {
      return;
    }

    if (command !== "zoom" && command !== "torch") return;

    if (command === "zoom") {
      targetSocket.emit("camera:control", {
        command: "zoom",
        action: action === "start" ? "start" : "stop",
        direction: Number(direction) < 0 ? -1 : 1
      });
      return;
    }

    targetSocket.emit("camera:control", {
      command: "torch",
      enabled: Boolean(arguments[0]?.enabled)
    });
  });

  socket.on("intercom:ptt", ({ room, target, active }) => {
    const targetRoom = room || socket.data.room;
    if (!targetRoom) return;

    if (socket.data.role === "director") {
      const payload = {
        from: socket.id,
        fromRole: "director",
        active: active === true
      };

      if (target) {
        const targetSocket = io.sockets.sockets.get(target);
        if (
          targetSocket?.data?.role === "camera" &&
          targetSocket?.data?.room === targetRoom
        ) {
          targetSocket.emit("intercom:ptt", payload);
        }
      } else {
        for (const memberId of io.sockets.adapter.rooms.get(targetRoom) || []) {
          const member = io.sockets.sockets.get(memberId);
          if (member?.data?.role === "camera") {
            member.emit("intercom:ptt", payload);
          }
        }
      }

      return;
    }

    if (socket.data.role === "camera") {
      const directorSocketId = [...io.sockets.adapter.rooms.get(targetRoom) || []]
        .find(id => io.sockets.sockets.get(id)?.data?.role === "director");

      if (!directorSocketId) return;

      const camera = rooms.get(targetRoom)?.get(socket.id);

      io.to(directorSocketId).emit("intercom:ptt", {
        from: socket.id,
        fromRole: "camera",
        active: active === true,
        slotId: camera?.slotId || null
      });
    }
  });

  for (const eventName of ["intercom:offer", "intercom:answer", "intercom:ice"]) {
    socket.on(eventName, payload => {
      const target = payload?.target;
      if (!target) return;

      const targetSocket = io.sockets.sockets.get(target);
      if (!targetSocket || targetSocket.data.room !== socket.data.room) return;

      const directorToCamera =
        socket.data.role === "director" &&
        targetSocket.data.role === "camera";

      const cameraToDirector =
        socket.data.role === "camera" &&
        targetSocket.data.role === "director";

      if (!directorToCamera && !cameraToDirector) return;

      const forwarded = {
        ...payload,
        from: socket.id
      };

      delete forwarded.target;
      targetSocket.emit(eventName, forwarded);
    });
  }

  socket.on("program:update", ({ room, liveSlots }) => {
    if (socket.data.role !== "director") return;

    const targetRoom = room || socket.data.room;
    if (!targetRoom) return;

    io.to(targetRoom).emit("program:status", {
      liveSlots: Array.isArray(liveSlots)
        ? liveSlots.map(Number).filter(Number.isFinite)
        : []
    });
  });

  socket.on(
    "webrtc:offer",
    ({ target, offer }) => {
      io
        .to(target)
        .emit(
          "webrtc:offer",
          {
            from: socket.id,
            offer
          }
        );

      console.log(
        "OFFER:",
        socket.id,
        "->",
        target
      );
    }
  );

  socket.on(
    "webrtc:answer",
    ({ target, answer }) => {
      io
        .to(target)
        .emit(
          "webrtc:answer",
          {
            from: socket.id,
            answer
          }
        );

      console.log(
        "ANSWER:",
        socket.id,
        "->",
        target
      );
    }
  );

  socket.on(
    "webrtc:ice",
    ({ target, candidate }) => {
      io
        .to(target)
        .emit(
          "webrtc:ice",
          {
            from: socket.id,
            candidate
          }
        );
    }
  );

  socket.on("disconnect", () => {
    const room =
      socket.data.room;

    if (socket.data.role === "director" && room) {
      for (const memberId of io.sockets.adapter.rooms.get(room) || []) {
        const member = io.sockets.sockets.get(memberId);
        if (member?.data?.role === "camera") {
          member.emit("intercom:director", {
            directorId: null
          });
        }
      }
    }

    if (
      socket.data.role === "camera" &&
      room &&
      rooms.has(room)
    ) {
      rooms
        .get(room)
        .delete(socket.id);

      socket
        .to(room)
        .emit(
          "camera:left",
          {
            socketId: socket.id
          }
        );
    }

    console.log(
      "DISCONNECTED:",
      socket.id
    );
  });
});

const PORT =
  process.env.PORT || 3001;

httpServer.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `ScenePilot signaling server running on ${PORT}`
    );
  }
);
