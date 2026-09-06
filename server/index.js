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

io.on("connection", socket => {
  console.log("ScenePilot client connected:", socket.id);

  socket.on("director:join", ({ room }) => {
    socket.join(room);
    socket.data.role = "director";
    socket.data.room = room;

    if (!rooms.has(room)) rooms.set(room, new Map());

    const cameras = [...rooms.get(room).values()];
    socket.emit("room:cameras", cameras);

    console.log(`Director joined ${room}`);
  });

  socket.on("camera:join", ({ room, name }) => {
    socket.join(room);
    socket.data.role = "camera";
    socket.data.room = room;
    socket.data.cameraName = name;

    if (!rooms.has(room)) rooms.set(room, new Map());

    const camera = {
      socketId: socket.id,
      name: name || "WIRELESS CAMERA",
      connected: true
    };

    rooms.get(room).set(socket.id, camera);

    socket.to(room).emit("camera:joined", camera);

    console.log(`${camera.name} joined ${room}`);
  });

  socket.on("webrtc:offer", ({ target, offer }) => {
    io.to(target).emit("webrtc:offer", {
      from: socket.id,
      offer
    });
  });

  socket.on("webrtc:answer", ({ target, answer }) => {
    io.to(target).emit("webrtc:answer", {
      from: socket.id,
      answer
    });
  });

  socket.on("webrtc:ice", ({ target, candidate }) => {
    io.to(target).emit("webrtc:ice", {
      from: socket.id,
      candidate
    });
  });

  socket.on("disconnect", () => {
    const room = socket.data.room;

    if (socket.data.role === "camera" && room && rooms.has(room)) {
      rooms.get(room).delete(socket.id);

      socket.to(room).emit("camera:left", {
        socketId: socket.id
      });
    }

    console.log("ScenePilot client disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`ScenePilot signaling server running on port ${PORT}`);
});
