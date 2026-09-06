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
const WIRELESS_SLOTS = [7, 8, 9];

function chooseCameraSlot(roomMap, requestedSlot, socketId) {
  const usedSlots = new Set(
    [...roomMap.values()]
      .filter(camera => camera.socketId !== socketId)
      .map(camera => camera.slotId)
  );

  const requested = Number(requestedSlot);

  if (
    WIRELESS_SLOTS.includes(requested) &&
    !usedSlots.has(requested)
  ) {
    return requested;
  }

  return (
    WIRELESS_SLOTS.find(slot => !usedSlots.has(slot)) ||
    requested ||
    7
  );
}

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
    if (socket.data.role === "camera") {
      console.log(
        "IGNORED DIRECTOR JOIN FROM CAMERA:",
        socket.id
      );
      return;
    }

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

    console.log(
      "DIRECTOR JOINED:",
      room,
      socket.id
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

      const roomMap = rooms.get(room);
      const assignedSlot = chooseCameraSlot(
        roomMap,
        slotId,
        socket.id
      );

      const camera = {
        socketId: socket.id,
        name: name || "WIRELESS CAMERA",
        connected: true,
        slotId: assignedSlot
      };

      roomMap.set(socket.id, camera);

      socket
        .to(room)
        .emit(
          "camera:joined",
          camera
        );

      console.log(
        "CAMERA JOINED:",
        room,
        socket.id,
        "CAM",
        assignedSlot
      );
    }
  );

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
