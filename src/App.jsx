import { useEffect, useRef, useState } from "react";
import {
  Radio, Circle, Mic2, Volume2, Wifi, BatteryFull,
  Settings, Maximize2, MonitorUp, Users, QrCode,
  Type, Layers, PictureInPicture2, Video, Camera,
  Smartphone, X
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import "./App.css";
import { socket } from "./socket";
import { createPeerConnection } from "./webrtc";

const initialCameras = [
  { id: 1, name: "STAGE LEFT", status: "LIVE", battery: 92, signal: 4 },
  { id: 2, name: "STAGE RIGHT", status: "READY", battery: 84, signal: 4 },
  { id: 3, name: "DRUMMER", status: "READY", battery: 71, signal: 3 },
  { id: 4, name: "PERCUSSION", status: "READY", battery: 66, signal: 4 },
  { id: 5, name: "CROWD A", status: "READY", battery: 95, signal: 3 },
  { id: 6, name: "CROWD B", status: "OFFLINE", battery: 0, signal: 0 },
  { id: 7, name: "ROAMING 1", status: "READY", battery: 78, signal: 4 },
  { id: 8, name: "ROAMING 2", status: "OFFLINE", battery: 0, signal: 0 },
  { id: 9, name: "WIDE / HOUSE", status: "READY", battery: 88, signal: 4 },
];

function App() {
  const [cameras, setCameras] = useState(initialCameras);
  const [program, setProgram] = useState(1);
  const [preview, setPreview] = useState(2);
  const [transition, setTransition] = useState("DISSOLVE");
  const [duration, setDuration] = useState(500);
  const [recording, setRecording] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState(null);
  const cameraVideo = useRef(null);
  const remoteVideos = useRef({});
  const peers = useRef({});
  const [remoteStreams, setRemoteStreams] = useState({});
  const [wirelessCameras, setWirelessCameras] = useState([]);

  const roomCode = "SP-4827";
  const joinUrl = `${window.location.origin}${window.location.pathname}?camera=1&room=${roomCode}`;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("camera") === "1") setShowCamera(true);
  }, []);

  useEffect(() => {
    if (showCamera) return;

    socket.connect();

    socket.emit("director:join", { room: roomCode });

    socket.on("room:cameras", list => {
      setWirelessCameras(list);
    });

    socket.on("camera:joined", async camera => {
      setWirelessCameras(prev => {
        if (prev.some(c => c.socketId === camera.socketId)) return prev;
        return [...prev, camera];
      });

      const peer = createPeerConnection({
        onIceCandidate: candidate => {
          socket.emit("webrtc:ice", {
            target: camera.socketId,
            candidate
          });
        },

        onTrack: incomingStream => {
          setRemoteStreams(prev => ({
            ...prev,
            [camera.socketId]: incomingStream
          }));
        }
      });

      peers.current[camera.socketId] = peer;

      const offer = await peer.createOffer({
        offerToReceiveVideo: true,
        offerToReceiveAudio: true
      });

      await peer.setLocalDescription(offer);

      socket.emit("webrtc:offer", {
        target: camera.socketId,
        offer
      });
    });

    socket.on("webrtc:answer", async ({ from, answer }) => {
      const peer = peers.current[from];
      if (!peer) return;

      await peer.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
    });

    socket.on("webrtc:ice", async ({ from, candidate }) => {
      const peer = peers.current[from];
      if (!peer || !candidate) return;

      try {
        await peer.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      } catch (error) {
        console.error("ICE error", error);
      }
    });

    socket.on("camera:left", ({ socketId }) => {
      peers.current[socketId]?.close();
      delete peers.current[socketId];

      setWirelessCameras(prev =>
        prev.filter(c => c.socketId !== socketId)
      );

      setRemoteStreams(prev => {
        const next = { ...prev };
        delete next[socketId];
        return next;
      });
    });

    return () => {
      socket.off("room:cameras");
      socket.off("camera:joined");
      socket.off("webrtc:answer");
      socket.off("webrtc:ice");
      socket.off("camera:left");

      Object.values(peers.current).forEach(peer => peer.close());
      peers.current = {};

      socket.disconnect();
    };
  }, [showCamera]);

  useEffect(() => {
    if (cameraVideo.current && stream) {
      cameraVideo.current.srcObject = stream;
    }
  }, [stream, showCamera]);

  async function enableCamera() {
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: true
      });

      setStream(media);

      socket.connect();

      socket.emit("camera:join", {
        room: roomCode,
        name: "WIRELESS CAMERA"
      });

      socket.off("webrtc:offer");
      socket.off("webrtc:ice");

      socket.on("webrtc:offer", async ({ from, offer }) => {
        const peer = createPeerConnection({
          onIceCandidate: candidate => {
            socket.emit("webrtc:ice", {
              target: from,
              candidate
            });
          }
        });

        peers.current[from] = peer;

        media.getTracks().forEach(track => {
          peer.addTrack(track, media);
        });

        await peer.setRemoteDescription(
          new RTCSessionDescription(offer)
        );

        const answer = await peer.createAnswer();

        await peer.setLocalDescription(answer);

        socket.emit("webrtc:answer", {
          target: from,
          answer
        });
      });

      socket.on("webrtc:ice", async ({ from, candidate }) => {
        const peer = peers.current[from];

        if (!peer || !candidate) return;

        try {
          await peer.addIceCandidate(
            new RTCIceCandidate(candidate)
          );
        } catch (error) {
          console.error("Camera ICE error", error);
        }
      });

    } catch (error) {
      alert(`Camera access failed: ${error.message}`);
    }
  }

  function stopCamera() {
    stream?.getTracks().forEach(track => track.stop());

    Object.values(peers.current).forEach(peer => peer.close());
    peers.current = {};

    socket.disconnect();

    setStream(null);
  }

  function take() {
    if (!preview || preview === program) return;
    const oldProgram = program;
    setProgram(preview);
    setPreview(oldProgram);
  }

  function cut() {
    setTransition("CUT");
    take();
  }

  if (showCamera) {
    return (
      <div className="operator-shell">
        <header className="operator-header">
          <div>
            <span className="eyebrow">SCENEPILOT CAMERA</span>
            <h1>Camera Operator</h1>
          </div>
          <span className="room-pill">ROOM {roomCode}</span>
        </header>

        <main className="operator-main">
          <div className="phone-monitor">
            {stream ? (
              <video ref={cameraVideo} autoPlay muted playsInline />
            ) : (
              <div className="camera-placeholder">
                <Camera size={52} />
                <strong>Camera not connected</strong>
                <span>Enable your camera to join the production.</span>
              </div>
            )}

            {stream && (
              <>
                <span className="operator-live"><i /> CONNECTED</span>
                <div className="operator-overlay">
                  <span>CAMERA 07</span>
                  <span>1080P</span>
                  <span>30 FPS</span>
                </div>
              </>
            )}
          </div>

          <section className="operator-card">
            <label>CAMERA NAME</label>
            <input defaultValue="ROAMING 1" />
            <div className="operator-status">
              <span><Wifi size={17}/> Production LAN</span>
              <span><BatteryFull size={17}/> Battery</span>
              <span><Mic2 size={17}/> Audio</span>
            </div>

            {!stream ? (
              <button className="enable-camera" onClick={enableCamera}>
                <Video size={20}/> ENABLE CAMERA + MICROPHONE
              </button>
            ) : (
              <button className="disconnect-camera" onClick={stopCamera}>
                DISCONNECT CAMERA
              </button>
            )}
          </section>

          <button className="return-director" onClick={() => {
            stopCamera();
            setShowCamera(false);
            history.replaceState({}, "", window.location.pathname);
          }}>
            Return to Director
          </button>
        </main>
      </div>
    );
  }

  const programCam = cameras.find(c => c.id === program);
  const previewCam = cameras.find(c => c.id === preview);

  return (
    <div className="console">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><Radio size={25}/></div>
          <div>
            <h1>SCENEPILOT</h1>
            <span>LIVE PRODUCTION CONSOLE</span>
          </div>
        </div>

        <div className="production-title">
          <span>PRODUCTION</span>
          <strong>GO-GO LIVE • MAIN STAGE</strong>
        </div>

        <div className="top-actions">
          <span className="network"><i/> PRODUCTION LAN</span>
          <button onClick={() => setShowJoin(true)}><Users size={18}/> ADD CAMERA</button>
          <button className="icon-button"><Settings size={19}/></button>
        </div>
      </header>

      <main className="workspace">
        <section className="monitor-section">
          <div className="monitor preview-monitor">
            <div className="monitor-head">
              <span>PREVIEW</span>
              <strong>PVW</strong>
            </div>
            <div className="screen">
              <div className="fake-feed preview-feed">
                <Camera size={54}/>
                <strong>CAM {String(preview).padStart(2,"0")}</strong>
                <span>{previewCam?.name}</span>
              </div>
              <span className="source-tag">CAM {preview}</span>
              <button className="fullscreen"><Maximize2 size={17}/></button>
            </div>
          </div>

          <div className="monitor program-monitor">
            <div className="monitor-head">
              <span>PROGRAM</span>
              <strong>PGM</strong>
            </div>
            <div className="screen">
              <div className="fake-feed program-feed">
                <Camera size={54}/>
                <strong>CAM {String(program).padStart(2,"0")}</strong>
                <span>{programCam?.name}</span>
              </div>
              <span className="live-badge"><i/> LIVE</span>
              <span className="source-tag">CAM {program}</span>
              <button className="fullscreen"><Maximize2 size={17}/></button>
            </div>
          </div>
        </section>

        <section className="camera-bank">
          <div className="section-title">
            <div><span>SOURCES</span><strong>CAMERA MULTIVIEW</strong></div>
            <span>{cameras.filter(c => c.status !== "OFFLINE").length} / 9 CONNECTED</span>
          </div>

          <div className="camera-grid">
            {cameras.map(cam => (
              <button
                key={cam.id}
                disabled={cam.status === "OFFLINE"}
                onClick={() => setPreview(cam.id)}
                className={`camera-tile
                  ${cam.id === program ? "is-program" : ""}
                  ${cam.id === preview ? "is-preview" : ""}
                  ${cam.status === "OFFLINE" ? "offline" : ""}`}
              >
                <div className="tile-feed">
                  {wirelessCameras[cam.id - 1] &&
                   remoteStreams[wirelessCameras[cam.id - 1].socketId] ? (
                    <video
                      autoPlay
                      playsInline
                      muted
                      ref={el => {
                        if (el) {
                          el.srcObject =
                            remoteStreams[
                              wirelessCameras[cam.id - 1].socketId
                            ];
                        }
                      }}
                    />
                  ) : (
                    <>
                      <Camera size={27}/>
                      <span>CAM {String(cam.id).padStart(2,"0")}</span>
                    </>
                  )}
                </div>

                <div className="tile-meta">
                  <strong>{cam.name}</strong>
                  <div>
                    <span><Wifi size={12}/>{cam.signal || "—"}</span>
                    <span><BatteryFull size={13}/>{cam.battery || "—"}%</span>
                  </div>
                </div>

                {cam.id === program && <span className="bus-label pgm">PGM</span>}
                {cam.id === preview && <span className="bus-label pvw">PVW</span>}
              </button>
            ))}
          </div>
        </section>

        <section className="control-deck">
          <div className="transition-panel">
            <div className="panel-label">TRANSITION</div>
            <div className="transition-types">
              {["CUT","DISSOLVE","FADE"].map(type => (
                <button
                  key={type}
                  onClick={() => setTransition(type)}
                  className={transition === type ? "active" : ""}
                >
                  {type}
                </button>
              ))}
            </div>

            <div className="duration">
              <span>DURATION</span>
              {[250,500,1000].map(ms => (
                <button
                  key={ms}
                  className={duration === ms ? "active" : ""}
                  onClick={() => setDuration(ms)}
                >
                  {ms === 1000 ? "1.0s" : `${ms/1000}s`}
                </button>
              ))}
            </div>

            <button className="take-button" onClick={transition === "CUT" ? cut : take}>
              <span>TAKE</span>
              <small>{transition} • {duration}ms</small>
            </button>
          </div>

          <div className="audio-panel">
            <div className="panel-label">MASTER AUDIO</div>
            <div className="audio-source">
              <Mic2 size={19}/>
              <div><span>SOURCE</span><strong>M-AUDIO AIR</strong></div>
              <span className="locked">MASTER</span>
            </div>
            <div className="meters">
              <div className="meter-label">L</div><div className="meter"><i style={{width:"78%"}}/></div>
              <div className="meter-label">R</div><div className="meter"><i style={{width:"71%"}}/></div>
            </div>
            <div className="audio-footer">
              <span><Volume2 size={15}/> -6.2 dB</span>
              <span>48 kHz</span>
            </div>
          </div>

          <div className="production-tools">
            <div className="panel-label">PRODUCTION</div>
            <div className="tool-grid">
              <button><Type size={19}/><span>LOWER THIRD</span></button>
              <button><Layers size={19}/><span>GRAPHICS</span></button>
              <button><PictureInPicture2 size={19}/><span>PiP</span></button>
              <button><MonitorUp size={19}/><span>MEDIA</span></button>
            </div>
          </div>

          <div className="record-panel">
            <div className="panel-label">OUTPUT</div>
            <button
              className={`record-button ${recording ? "recording" : ""}`}
              onClick={() => setRecording(!recording)}
            >
              <Circle size={19} fill="currentColor"/>
              {recording ? "STOP RECORDING" : "RECORD"}
            </button>
            <div className="output-data">
              <span>1080p30</span><span>REC • LOCAL</span>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <span>SCENEPILOT ENGINE</span>
        <span><i/> SYSTEM READY</span>
        <span>ROOM {roomCode}</span>
        <span>00:00:00</span>
      </footer>

      {showJoin && (
        <div className="modal-backdrop" onClick={() => setShowJoin(false)}>
          <div className="join-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowJoin(false)}><X/></button>
            <div className="join-icon"><Smartphone size={29}/></div>
            <span className="eyebrow">ADD WIRELESS CAMERA</span>
            <h2>Join this production</h2>
            <p>Connect the phone to the production Wi-Fi, then scan this code.</p>
            <div className="qr-wrap"><QRCodeSVG value={joinUrl} size={190}/></div>
            <div className="room-code"><span>ROOM CODE</span><strong>{roomCode}</strong></div>
            <button className="camera-demo" onClick={() => {
              setShowJoin(false);
              setShowCamera(true);
            }}>
              OPEN CAMERA MODE ON THIS DEVICE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
