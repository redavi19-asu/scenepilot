import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Capacitor } from "@capacitor/core";
import {
  getWindowBounds, isDesktopWindowSupported, parseWorkspace, popupFeatures,
  readWorkspace, safeBounds, validPopoutView, WORKSPACE_STORAGE_KEY
} from "./popoutWorkspace";

const WINDOW_STYLE = `
:root{color-scheme:dark}*{box-sizing:border-box}html,body,#uds-popout-root{width:100%;height:100%;margin:0;overflow:hidden;background:#080e11;color:#f0f6f5;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.uds-window{height:100%;width:100%;display:flex;flex-direction:column;background:#091216}
.uds-window-head{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:10px 16px;background:#111c22;border-bottom:1px solid #38545d;min-height:53px}
.uds-window-head strong{font-size:13px;letter-spacing:.09em}.uds-window-head span{display:block;color:#96acb5;font-size:10px;letter-spacing:.09em;margin-top:4px}
.uds-window-head button{color:#f4f9fa;border:1px solid #60717c;background:#26373f;padding:7px 10px;cursor:pointer;font-size:11px}
.uds-window-screen{flex:1;min-height:0;position:relative;display:grid;place-items:stretch;background:#050707;overflow:hidden}
.uds-feed{position:relative;min-width:0;min-height:0;overflow:hidden;background:#080b0e}
.uds-feed video,.uds-feed img{width:100%;height:100%;object-fit:contain;display:block;background:#050608}
.uds-feed .uds-source-label{position:absolute;left:8px;bottom:8px;background:#060909cc;border:1px solid #394c50;color:#ecf5f6;padding:4px 7px;font-size:11px;letter-spacing:.05em}
.uds-feed.offline{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:7px;color:#809399;font-weight:750}
.uds-feed.offline small{font-size:11px;font-weight:400;opacity:.8}
.uds-demo-label{position:absolute;top:8px;right:8px;padding:5px 7px;background:#4e391cdd;color:#fce4af;font-size:10px;font-weight:800;letter-spacing:.07em}
.uds-window-footer{display:flex;justify-content:space-between;gap:8px;padding:7px 13px;background:#121e24;border-top:1px solid #273d45;color:#a9c0c5;font-size:10px;letter-spacing:.04em}
.uds-grid-nine{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(3,minmax(0,1fr));gap:4px;padding:4px;height:100%;width:100%;background:#080e12}
.uds-grid-nine>.uds-feed{border:1px solid #2d424b}.uds-grid-nine .uds-source-label{font-size:10px;left:4px;bottom:4px;padding:2px 4px}
.uds-layout{width:100%;height:100%;min-height:0;min-width:0;display:grid;overflow:hidden}
.uds-layout.split{grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}
.uds-layout.pip>.uds-feed:first-child{grid-area:1/1}.uds-layout.pip>.uds-feed:nth-child(2){grid-area:1/1;align-self:start;justify-self:end;width:32%;height:33%;border:3px solid #d4e9e7;margin:18px;z-index:2;box-shadow:0 10px 20px #000c}
.uds-layout.nine{grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:4px}.uds-layout.nine>.uds-feed{grid-area:1/1}
.uds-side-eight{grid-area:1/2;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(4,minmax(0,1fr));gap:4px;min-height:0}
.uds-hold{height:100%;display:grid;place-content:center;text-align:center;gap:14px;color:#dae6e3;letter-spacing:.12em;background:radial-gradient(circle,#243833,#080e12 70%)}
.uds-hold strong{font-size:clamp(20px,5vw,52px)}.uds-hold small{font-size:11px;color:#98b0ac}
.uds-live-indicator{color:#9edda6}.uds-live-indicator::before{content:"";display:inline-block;width:8px;height:8px;background:#a9e0a1;border-radius:50%;margin-right:7px}
@media(max-width:550px){.uds-window-head{padding:8px}.uds-window-head strong{font-size:11px}.uds-window-footer{font-size:9px}.uds-layout.pip>.uds-feed:nth-child(2){margin:6px}}
`;

export function usePopoutWorkspace() {
  const windowsRef = useRef(new Map());
  const rememberedRef = useRef(readWorkspace(typeof window !== "undefined" ? window.localStorage : null));
  const [windows, setWindows] = useState([]);
  const [message, setMessage] = useState("");
  const desktop = typeof window !== "undefined" &&
    isDesktopWindowSupported(Capacitor.isNativePlatform(), window.matchMedia?.bind(window));

  const notify = useCallback(() => {
    setWindows(Array.from(windowsRef.current.values()));
  }, []);

  const snapshot = useCallback(() => {
    const existing = rememberedRef.current;
    const views = [...existing.views];
    const bounds = { ...existing.bounds };
    for (const [id, entry] of windowsRef.current) {
      if (!views.includes(id)) views.push(id);
      try {
        if (!entry.popup.closed) bounds[id] = getWindowBounds(entry.popup);
      } catch { /* A navigated cross-origin window cannot disclose its geometry. */ }
    }
    const saved = parseWorkspace({ version: 1, views, bounds });
    rememberedRef.current = saved;
    try { window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(saved)); }
    catch { /* Private sessions can prevent storage. */ }
    return saved;
  }, []);

  const close = useCallback((id) => {
    const entry = windowsRef.current.get(id);
    if (!entry) return;
    snapshot();
    windowsRef.current.delete(id);
    entry.popup.removeEventListener?.("pagehide", entry.onClose);
    try { if (!entry.popup.closed) entry.popup.close(); } catch { /* Already closed */ }
    notify();
  }, [snapshot, notify]);

  const open = useCallback((id) => {
    if (!validPopoutView(id)) return false;
    if (!desktop) {
      setMessage("Desktop pop-out windows require a compatible desktop browser; the iPhone/iPad app keeps its normal view.");
      return false;
    }
    const existing = windowsRef.current.get(id);
    if (existing && !existing.popup.closed) {
      existing.popup.focus();
      return true;
    }
    if (existing) windowsRef.current.delete(id);

    const previous = rememberedRef.current.bounds[id];
    const offset = windowsRef.current.size * 32;
    const bounds = safeBounds(previous || { left: window.screenX + 100 + offset, top: window.screenY + 90 + offset, width: 940, height: 560 });
    const label = id.startsWith("camera-") ? id.replace("camera-", "CAM ") : id.toUpperCase();
    // about:blank inherits the opener's origin. React portals use the same JS
    // context/streams and NEVER establish a second WebRTC peer connection.
    const popup = window.open("about:blank", `uds-popout-${id}`, popupFeatures(bounds));
    if (!popup) {
      setMessage("Your browser blocked the pop-out. Allow pop-ups for Urban Director Studio and click again.");
      return false;
    }
    try {
      popup.document.title = `Urban Director Studio — ${label}`;
      popup.document.body.replaceChildren();
      const style = popup.document.createElement("style");
      style.textContent = WINDOW_STYLE;
      popup.document.head.appendChild(style);
      const host = popup.document.createElement("div");
      host.id = "uds-popout-root";
      popup.document.body.appendChild(host);
      const entry = { id, popup, host, onClose: null };
      const onClose = () => {
        snapshot();
        if (windowsRef.current.get(id) === entry) {
          windowsRef.current.delete(id);
          notify();
        }
      };
      entry.onClose = onClose;
      popup.addEventListener("pagehide", onClose);
      windowsRef.current.set(id, entry);
      snapshot();
      notify();
      setMessage(`${label} opened. Drag its title bar onto any connected monitor.`);
      popup.focus();
      return true;
    } catch {
      try { popup.close(); } catch { /* ignore */ }
      setMessage("Unable to attach the view to this window; check browser pop-up permissions.");
      return false;
    }
  }, [desktop, snapshot, notify]);

  const restore = useCallback(() => {
    const saved = rememberedRef.current;
    if (!saved.views.length) {
      setMessage("No saved layout yet. Open the desired views first, then click Save Layout.");
      return;
    }
    let opened = 0;
    for (const id of saved.views) if (open(id)) opened++;
    setMessage(opened === saved.views.length
      ? "Workspace restored. Adjust windows across your screens as needed."
      : `Opened ${opened} of ${saved.views.length} views. Your browser may limit pop-ups; allow them and reopen the remaining views individually.`);
  }, [open]);

  const closeAll = useCallback(() => {
    snapshot();
    for (const entry of windowsRef.current.values()) {
      entry.popup.removeEventListener?.("pagehide", entry.onClose);
      try { entry.popup.close(); } catch { /* Already closed */ }
    }
    windowsRef.current.clear();
    notify();
    setMessage("All pop-outs closed. Saved workspace positions are preserved.");
  }, [snapshot, notify]);

  useEffect(() => {
    if (!windows.length) return undefined;
    const interval = window.setInterval(() => {
      let changed = false;
      for (const [id, entry] of windowsRef.current) {
        if (entry.popup.closed) {
          windowsRef.current.delete(id);
          changed = true;
        }
      }
      snapshot(); // Remember screen placement without re-rendering the live feed.
      if (changed) notify();
    }, 2000);
    return () => window.clearInterval(interval);
  }, [windows.length, snapshot, notify]);

  useEffect(() => () => {
    for (const entry of windowsRef.current.values()) {
      entry.popup.removeEventListener?.("pagehide", entry.onClose);
      try { entry.popup.close(); } catch { /* Closed by browser */ }
    }
    windowsRef.current.clear();
  }, []);

  return { windows, open, restore, close, closeAll, save: snapshot, desktop, message, savedCount: rememberedRef.current.views.length };
}

function SharedStream({ stream }) {
  const ref = useRef(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream || null;
    if (stream) video.play?.().catch(() => {});
    return () => {
      if (video.srcObject === stream) video.srcObject = null;
    };
  }, [stream]);
  return <video ref={ref} autoPlay muted playsInline aria-label="Silent duplicate of the existing live video feed"/>;
}

function ProgramStream({ acquire }) {
  const [stream, setStream] = useState(null);
  useEffect(() => {
    const next = acquire?.() || null;
    setStream(next);
  // The compositor is a singleton in the parent Director. Starting it once
  // keeps the same stream and peer connections through all camera changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return stream ? <SharedStream stream={stream}/> : <div className="uds-hold"><strong>PROGRAM UNAVAILABLE</strong><small>CHOOSE A SOURCE AND TAKE</small></div>;
}

function PopoutView({ entry, close, sources, preview, program, main, mode, secondary, standby, replay, roomCode, cameraNames, acquireProgramStream }) {
  const { id, popup } = entry;
  const title = id === "program" ? "PROGRAM / PGM" : id === "preview" ? "PREVIEW / PVW" :
    id === "main" ? "MAIN CAM" : id === "multiview" ? "9-CAMERA MULTIVIEW" :
    id === "director" ? "DIRECTOR CAM" : id === "screen" ? "SHARED SCREEN" :
    `CAM ${String(Number(id.slice(7))).padStart(2, "0")}`;

  const getStream = slot => {
    if (slot === "director") return sources.directorStream;
    if (slot === "screen-share") return sources.screenStream;
    const cam = sources.wirelessCameras.find(x => x.slotId === slot);
    return cam ? sources.remoteStreams[cam.socketId] : null;
  };
  const label = slot => {
    if (!slot) return "NO SOURCE";
    if (slot === "director") return "DIRECTOR CAM";
    if (slot === "screen-share") return "SHARED SCREEN";
    return cameraNames[slot] || `CAM ${String(slot).padStart(2, "0")}`;
  };
  const source = (slot, key) => {
    const stream = getStream(slot);
    const still = sources.demoStills[slot];
    return <div className={`uds-feed ${!stream && !still ? "offline" : ""}`} key={key || slot || "empty"}>
      {stream ? <SharedStream stream={stream}/> :
        still ? <img src={still.url} alt={`${label(slot)} demonstration still`}/> :
        <><span>{label(slot)}</span><small>NO LIVE CAMERA</small></>}
      <span className="uds-source-label">{label(slot)}</span>
      {!stream && still && <span className="uds-demo-label">DEMO STILL • NOT LIVE</span>}
    </div>;
  };
  const layout = (layoutMode, primary, second) => {
    if (layoutMode === "nine") {
      return <div className="uds-layout nine">
        {source(primary, "main")}
        <div className="uds-side-eight">{Array.from({ length: 9 }, (_, i) => i + 1).filter(i => i !== primary).slice(0, 8).map(i => source(i, `side-${i}`))}</div>
      </div>;
    }
    if (layoutMode === "split" || layoutMode === "pip") {
      return <div className={`uds-layout ${layoutMode}`}>{source(primary, "primary")}{source(second, "secondary")}</div>;
    }
    return source(primary, "single");
  };
  let picture;
  if (id === "multiview") picture = <div className="uds-grid-nine">{Array.from({ length: 9 }, (_, i) => source(i + 1, `cam-${i + 1}`))}</div>;
  else if (id === "main") picture = source(main, "main");
  else if (id === "director") picture = source("director", "director");
  else if (id === "screen") picture = source("screen-share", "screen");
  else if (id.startsWith("camera-")) picture = source(Number(id.slice(7)), id);
  else if (id === "preview") {
    picture = replay?.mode === "preview" && replay?.url
      ? <video src={replay.url} controls muted playsInline style={{width:"100%",height:"100%",objectFit:"contain"}}/>
      : layout(mode, preview, secondary);
  } else {
    picture = standby ? <div className="uds-hold"><strong>PLEASE STAND BY</strong><small>URBAN DIRECTOR STUDIO</small></div> :
      replay?.mode === "program" && replay?.url
        ? <video src={replay.url} autoPlay muted playsInline style={{width:"100%",height:"100%",objectFit:"contain"}}/>
        : <ProgramStream acquire={acquireProgramStream}/>;
  }
  const kind = id === "program" ? "ON AIR / PROGRAM MIRROR" : id === "preview" ? "NEXT SHOT / NOT ON AIR" : id === "multiview" ? "ALL NINE CAMERA SLOTS" : "SOURCE MONITOR / NOT A SECOND CONNECTION";
  return createPortal(
    <div className="uds-window">
      <header className="uds-window-head">
        <div><strong>{title}</strong><span>{kind}</span></div>
        <button type="button" onClick={() => close(id)} aria-label={`Close ${title} pop-out`}>CLOSE VIEW ×</button>
      </header>
      <main className="uds-window-screen">{picture}</main>
      <footer className="uds-window-footer"><span className={id==="program"&&!standby?"uds-live-indicator":""}>UDS • {roomCode}</span><span>VIDEO MIRROR • AUDIO MUTED • DRAG WINDOW TO ANOTHER DISPLAY</span></footer>
    </div>, entry.host);
}

export function PopoutPortals({ workspace, ...props }) {
  return <>{workspace.windows.map(entry =>
    <PopoutView key={entry.id} entry={entry} close={workspace.close} {...props}/>)}</>;
}
