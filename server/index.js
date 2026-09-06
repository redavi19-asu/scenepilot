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

app.get(["/camera", "/camera/"], (req, res) => {
  res.set("Cache-Control", "no-store");
  res.send(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <title>ScenePilot Camera</title>
        <style>
          :root {
            color-scheme: dark;
            font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background: #11140f;
            color: #f2f0e8;
          }
          * { box-sizing: border-box; }
          body { margin: 0; min-height: 100vh; background: #11140f; }
          .shell { max-width: 760px; margin: 0 auto; min-height: 100vh; padding: 20px; }
          header { display: flex; justify-content: space-between; gap: 16px; align-items: center; margin-bottom: 18px; }
          .eyebrow { display: block; font-size: 11px; letter-spacing: .18em; color: #9ca091; font-weight: 800; }
          h1 { margin: 4px 0 0; font-size: 26px; letter-spacing: .04em; }
          .room { border: 1px solid #43483e; padding: 9px 12px; font-size: 12px; font-weight: 800; letter-spacing: .08em; }
          .monitor { position: relative; aspect-ratio: 16/10; border: 1px solid #4a5045; background: #080a07; overflow: hidden; }
          video { width: 100%; height: 100%; object-fit: cover; display: block; background: #080a07; }
          .placeholder { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; color: #8e9387; padding: 28px; }
          .placeholder strong { display: block; color: #d5d8cf; font-size: 18px; margin-bottom: 7px; }
          .live { position: absolute; top: 12px; left: 12px; display: none; align-items: center; gap: 7px; background: #b72e27; color: white; padding: 7px 10px; font-size: 11px; font-weight: 900; letter-spacing: .08em; }
          .live i { width: 7px; height: 7px; border-radius: 50%; background: white; }
          .overlay { position: absolute; left: 12px; right: 12px; bottom: 12px; display: none; justify-content: space-between; gap: 10px; font-size: 10px; font-weight: 800; letter-spacing: .08em; background: rgba(0,0,0,.62); padding: 9px 10px; }
          .card { border: 1px solid #3f443b; border-top: 0; padding: 18px; background: #171a15; }
          label { display: block; font-size: 10px; letter-spacing: .15em; color: #9ca091; font-weight: 800; margin-bottom: 7px; }
          input { width: 100%; padding: 13px 14px; border: 1px solid #4b5147; background: #0e100d; color: #f2f0e8; font: inherit; margin-bottom: 14px; }
          button { width: 100%; border: 0; padding: 15px 16px; font-size: 13px; font-weight: 900; letter-spacing: .06em; cursor: pointer; background: #f0ede4; color: #11140f; }
          button.disconnect { background: #b72e27; color: white; }
          .status { margin-top: 12px; font-size: 12px; color: #9ca091; text-align: center; min-height: 18px; }
          .status.good { color: #8fc28d; }
          .status.bad { color: #e26a63; }
        </style>
      </head>
      <body>
        <main class="shell">
          <header>
            <div>
              <span class="eyebrow">SCENEPILOT CAMERA</span>
              <h1>Camera Operator</h1>
            </div>
            <div class="room" id="roomLabel">ROOM SP-4827</div>
          </header>
          <section class="monitor">
            <video id="cameraVideo" autoplay muted playsinline></video>
            <div class="placeholder" id="placeholder">
              <div><strong>Camera not connected</strong><span>Enable the camera to join the production.</span></div>
            </div>
            <div class="live" id="liveBadge"><i></i> CONNECTED</div>
            <div class="overlay" id="overlay"><span>CAMERA 07</span><span>1080P</span><span>30 FPS</span></div>
          </section>
          <section class="card">
            <label for="cameraName">CAMERA NAME</label>
            <input id="cameraName" value="ROAMING 1" />
            <button id="cameraButton">ENABLE CAMERA + MICROPHONE</button>
            <div class="status" id="status">Ready to join</div>
          </section>
        </main>
        <script src="/socket.io/socket.io.js"></script>
        <script>
          (() => {
            const params = new URLSearchParams(window.location.search);
            const room = params.get("room") || "SP-4827";
            const socket = io({
              transports: ["websocket", "polling"],
              reconnection: true,
              reconnectionAttempts: Infinity
            });
            const video = document.getElementById("cameraVideo");
            const button = document.getElementById("cameraButton");
            const status = document.getElementById("status");
            const placeholder = document.getElementById("placeholder");
            const liveBadge = document.getElementById("liveBadge");
            const overlay = document.getElementById("overlay");
            const nameInput = document.getElementById("cameraName");
            document.getElementById("roomLabel").textContent = "ROOM " + room;

            let media = null;
            let peer = null;
            let directorId = null;
            let pendingIce = [];
            let joined = false;

            function setStatus(message, kind) {
              status.textContent = message;
              status.className = "status" + (kind ? " " + kind : "");
            }

            function joinCamera() {
              if (!media || !socket.connected) return;
              socket.emit("camera:join", {
                room,
                name: nameInput.value.trim() || "ROAMING 1",
                slotId: 7
              });
              joined = true;
              setStatus("Joined production. Waiting for director...", "good");
            }

            function createPeer(target) {
              const nextPeer = new RTCPeerConnection({
                iceServers: [{
                  urls: [
                    "stun:stun.l.google.com:19302",
                    "stun:stun1.l.google.com:19302"
                  ]
                }]
              });

              nextPeer.onicecandidate = event => {
                if (event.candidate && target) {
                  socket.emit("webrtc:ice", {
                    target,
                    candidate: event.candidate
                  });
                }
              };

              nextPeer.onconnectionstatechange = () => {
                const state = nextPeer.connectionState;
                if (state === "connected") {
                  setStatus("Live to ScenePilot director", "good");
                } else if (state === "failed") {
                  setStatus("WebRTC connection failed. Rejoining...", "bad");
                  try { nextPeer.close(); } catch (_) {}
                  peer = null;
                  directorId = null;
                  joinCamera();
                } else if (state === "disconnected") {
                  setStatus("Connection interrupted. Reconnecting...");
                }
              };

              return nextPeer;
            }

            socket.on("connect", () => {
              if (media) joinCamera();
            });

            socket.on("disconnect", () => {
              if (media) setStatus("Signaling disconnected. Reconnecting...");
            });

            socket.on("webrtc:offer", async ({ from, offer }) => {
              try {
                directorId = from;
                if (peer) {
                  try { peer.close(); } catch (_) {}
                }

                peer = createPeer(from);
                media.getTracks().forEach(track => {
                  peer.addTrack(track, media);
                });

                await peer.setRemoteDescription(offer);

                for (const candidate of pendingIce) {
                  await peer.addIceCandidate(candidate);
                }
                pendingIce = [];

                const answer = await peer.createAnswer();
                await peer.setLocalDescription(answer);

                socket.emit("webrtc:answer", {
                  target: from,
                  answer: peer.localDescription
                });

                setStatus("Connecting video to director...", "good");
              } catch (error) {
                console.error("ScenePilot camera offer error", error);
                setStatus("Camera connection error: " + error.message, "bad");
              }
            });

            socket.on("webrtc:ice", async ({ from, candidate }) => {
              if (!candidate) return;

              if (!peer || !peer.remoteDescription || (directorId && from !== directorId)) {
                pendingIce.push(candidate);
                return;
              }

              try {
                await peer.addIceCandidate(candidate);
              } catch (error) {
                console.error("ScenePilot camera ICE error", error);
              }
            });

            async function enableCamera() {
              try {
                setStatus("Requesting camera permission...");
                media = await navigator.mediaDevices.getUserMedia({
                  video: {
                    facingMode: { ideal: "environment" },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                  },
                  audio: true
                });

                video.srcObject = media;
                placeholder.style.display = "none";
                liveBadge.style.display = "flex";
                overlay.style.display = "flex";
                button.textContent = "DISCONNECT CAMERA";
                button.classList.add("disconnect");

                joinCamera();
              } catch (error) {
                console.error("ScenePilot camera access error", error);
                setStatus("Camera access failed: " + error.message, "bad");
              }
            }

            function disconnectCamera() {
              if (media) {
                media.getTracks().forEach(track => track.stop());
              }
              media = null;
              joined = false;
              pendingIce = [];
              if (peer) {
                try { peer.close(); } catch (_) {}
              }
              peer = null;
              directorId = null;
              socket.disconnect();
              video.srcObject = null;
              placeholder.style.display = "grid";
              liveBadge.style.display = "none";
              overlay.style.display = "none";
              button.textContent = "ENABLE CAMERA + MICROPHONE";
              button.classList.remove("disconnect");
              setStatus("Disconnected");
            }

            button.addEventListener("click", () => {
              if (media) disconnectCamera();
              else enableCamera();
            });
          })();
        </script>
      </body>
    </html>
  `);
});

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
