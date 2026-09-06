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
const directors = new Map();

app.get("/", (req, res) => {
  res.send(`
    <!doctype html>
    <html>
      <head>
        <title>ScenePilot Signal Server</title>
        <style>
          body{
            font-family:Arial,sans-serif;
            background:#111;
            color:#eee;
            display:grid;
            place-items:center;
            height:100vh;
            margin:0;
          }

          .box{
            border:1px solid #555;
            padding:32px 40px;
            border-radius:12px;
            background:#1b1b1b;
            text-align:center;
          }

          .ok{color:#8fd18f}
          small{color:#999}
        </style>
      </head>

      <body>
        <div class="box">
          <h1>SCENEPILOT</h1>
          <h2 class="ok">SIGNAL SERVER ONLINE</h2>
          <small>WebRTC coordination service</small>
        </div>
      </body>
    </html>
  `);
});

io.on("connection", socket => {

  console.log("Connected:", socket.id);

  socket.on("director:join", ({ room }) => {

    socket.join(room);

    socket.data.role = "director";
    socket.data.room = room;

    directors.set(room, socket.id);

    if (!rooms.has(room)) {
      rooms.set(room, new Map());
    }

    socket.emit(
      "room:cameras",
      [...rooms.get(room).values()]
    );

    socket.to(room).emit("director:available", {
      socketId: socket.id
    });

    console.log(
      `Director ${socket.id} joined ${room}`
    );
  });

  socket.on("camera:join", ({ room, name }) => {

    socket.join(room);

    socket.data.role = "camera";
    socket.data.room = room;
    socket.data.cameraName =
      name || "WIRELESS CAMERA";

    if (!rooms.has(room)) {
      rooms.set(room, new Map());
    }

    const camera = {
      socketId: socket.id,
      name: socket.data.cameraName,
      connected: true
    };

    rooms.get(room).set(
      socket.id,
      camera
    );

    socket.to(room).emit(
      "camera:joined",
      camera
    );

    const directorId =
      directors.get(room);

    if (directorId) {
      socket.emit(
        "director:available",
        {
          socketId: directorId
        }
      );
    }

    console.log(
      `${camera.name} joined ${room}`
    );
  });

  socket.on(
    "webrtc:offer",
    ({ target, offer }) => {

      io.to(target).emit(
        "webrtc:offer",
        {
          from: socket.id,
          offer
        }
      );
    }
  );

  socket.on(
    "webrtc:answer",
    ({ target, answer }) => {

      io.to(target).emit(
        "webrtc:answer",
        {
          from: socket.id,
          answer
        }
      );
    }
  );

  socket.on("disconnect", () => {

    const room =
      socket.data.room;

    if (
      socket.data.role === "director" &&
      room
    ) {
      if (
        directors.get(room) === socket.id
      ) {
        directors.delete(room);
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
        .emit("camera:left", {
          socketId: socket.id
        });
    }

    console.log(
      "Disconnected:",
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
