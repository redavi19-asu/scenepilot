import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, CircleHelp, Search, X } from "lucide-react";
import "./StudioGuide.css";

// These are explanatory only. The tour never presses TAKE, starts recording,
// grants camera permissions, or changes an on-air source.
export const STUDIO_TOUR = [
  { title: "Add a camera", target: ".camera-share-control", caption: "Invite a phone or other camera to your production. Show the QR code or send the secure link. The camera operator grants camera and microphone permission on their device." },
  { title: "Incoming sources (ingest)", target: ".camera-bank", caption: "Ingest means bringing video and audio INTO the studio. Connected phones arrive here as live camera sources. Tap a camera to prepare it without going live." },
  { title: "Preview / PVW", target: ".preview-monitor", caption: "Preview is your rehearsal monitor. Choose a shot here first. The audience does NOT see it until you press TAKE." },
  { title: "Program / PGM", target: ".program-monitor", caption: "Program is the on-air picture. Check this monitor before and during a broadcast or Program recording." },
  { title: "Main camera", target: ".main-camera-home", caption: "Set a home camera using the selector or drag a connected camera here. You can return to this source after other shots." },
  { title: "Screen or window source", target: ".external-source-panel", caption: "On compatible devices, choose SHARE SCREEN / WINDOW, allow capture, and select an app or browser window. Preview it, then TAKE. Sharing a window is NOT direct URL stream ingest." },
  { title: "TAKE — send it live", target: ".take-button|.director-floating-take", caption: "TAKE puts your prepared Preview shot or layout into Program. This is a live action: the tour will never press it for you." },
  { title: "Transitions", target: ".transition-panel|.take-standby-row", caption: "CUT changes immediately; DISSOLVE and FADE animate the change. Select the transition and duration before pressing TAKE." },
  { title: "Master audio", target: ".audio-panel", caption: "Choose a microphone or mix and adjust the available channels. Always check the sound of the actual recording or stream after changing sources." },
  { title: "Live layouts", target: ".production-tools", caption: "Choose SINGLE, SPLIT, PiP (picture-in-picture), or 9-CAM. Set the sources in Preview and press TAKE to use the layout." },
  { title: "Record the production", target: ".record-panel", caption: "Choose the recording mode offered by your account, start recording, and stop when finished. Confirm that your file is available before leaving." },
  { title: "Help is always here", target: ".director-menu-trigger", caption: "Open the menu and choose TIPS / HELP whenever you want to replay this tour or search the complete manual." }
];

export const STUDIO_MANUAL = [
  { id: "start", title: "Your first production", tags: "start beginner setup checklist", steps: [
    "Open Director on the device you will use to control the show. Keep it charged and connected to reliable Wi-Fi or wired internet.",
    "Use ADD CAMERA to display a QR code or send a secure camera link. Ask your operators to open it and allow camera/microphone access.",
    "Confirm that each camera appears in CAMERA MULTIVIEW. Use SET NAMES so you know which operator is which.",
    "Choose MAIN CAM, tap a different camera for PREVIEW, verify Program, and press TAKE only when ready to change the audience's picture.",
    "Set your audio, layout, graphics, and recording before the live show. Rehearse with a short test recording."
  ]},
  { id: "ingest", title: "Ingest: what it means and what works", tags: "ingest stream feed URL HLS RTMP SRT news input source HDMI", steps: [
    "INGEST simply means bringing an outside video/audio source INTO Urban Director Studio so you can monitor or use it in a production.",
    "Wireless camera ingest: a phone opens your secure invite, permits camera/mic access, and sends a live WebRTC feed to its camera slot.",
    "Director camera ingest: enable the local Director Cam, grant permission, then PREVIEW, SET MAIN, or ADD AS PiP.",
    "Screen/window capture: on a compatible desktop browser, use SHARE SCREEN / WINDOW, choose a tab/window/screen in the permission dialog, and press PREVIEW. TAKE sends it to Program.",
    "A website or news page shared through screen capture is different from a direct network feed. Direct HLS, SRT, or RTMP stream-URL ingest is planned, NOT available through this screen-sharing control.",
    "Audio from a shared tab/window is platform-dependent. Check a short recording: switching the Program picture does not guarantee that the captured audio switches with it.",
    "Only use outside video you are permitted to rebroadcast. A subscription or website viewing permission does not automatically grant broadcast rights."
  ]},
  { id: "add", title: "Add cameras and manage nine slots", tags: "phone link qr codes camera multiview names", steps: [
    "Tap ADD CAMERA, then SHOW QR CODE, COPY CAMERA LINK, TEXT INVITE, or EMAIL INVITE.",
    "The operator opens the camera link, names the device, selects the desired camera, and taps ENABLE CAMERA + MICROPHONE.",
    "Watch the camera's connection and status in CAMERA MULTIVIEW; label slots with SET NAMES.",
    "Tap a camera tile to PREVIEW it. Drag or select a connected source for MAIN CAM.",
    "A disconnected camera may reconnect in its room. If it stays offline, check camera permission, network access, and whether the operator's page remains open."
  ]},
  { id: "switch", title: "Preview, Program, TAKE and standby", tags: "preview pvw program pgm main live switching", steps: [
    "PREVIEW (PVW) is the next shot; PROGRAM (PGM) is the current broadcast or Program recording.",
    "Choose a camera, screen source, or layout in Preview. Press TAKE to put it on Program.",
    "Select CUT, DISSOLVE, or FADE and a duration to control the picture transition.",
    "MAIN CAM is the designated home shot. When no new Preview is waiting, TAKE can return to Main Cam.",
    "STANDBY / HOLD puts a holding screen on Program while maintaining the session. RETURN TO PROGRAM restores your picture."
  ]},
  { id: "screen", title: "Show a webpage or another application", tags: "screen share external source window browser news", steps: [
    "On a supported browser, select SHARE SCREEN / WINDOW under EXTERNAL VIDEO SOURCE.",
    "Approve your operating system's capture dialog and select the specific tab, window, or entire screen.",
    "Tap PREVIEW SCREEN and confirm the content in Preview; use ADD AS PiP to put the screen inside a camera shot.",
    "Press TAKE when you intentionally want the selected content shown in Program.",
    "Tap STOP SHARE to disconnect. If screen capture is unsupported on the current iPhone/iPad app or browser, use a compatible desktop source; the app cannot bypass system restrictions."
  ]},
  { id: "layout", title: "Single, Split, PiP and 9-CAM", tags: "multiview layout split pip picture-in-picture nine-cam", steps: [
    "SINGLE displays one primary source. SPLIT displays two sources side by side.",
    "PiP means picture-in-picture: a smaller source appears over a larger shot. Choose a secondary source.",
    "9-CAM arranges available camera slots into a nine-view composition. Offline slots do not become real cameras.",
    "For demonstration screenshots, you may upload clearly labeled DEMO STILL images into offline slots. They are not live feeds.",
    "Build your arrangement in Preview and press TAKE only when you are satisfied."
  ]},
  { id: "audio", title: "Audio routing and microphone checks", tags: "master audio sound mic mixer mute", steps: [
    "Open MASTER AUDIO. Choose MIX ALL ACTIVE MICS or a specific available microphone as your monitor/mix source.",
    "Adjust available camera channel controls and watch the meters where provided.",
    "Have each operator speak in turn and listen with headphones to check for clipping, echo and dead microphones.",
    "Perform a brief recording and play it back to confirm the audio actually present in the exported Program, particularly if using screen capture.",
    "If a camera drops and returns, verify that its sound is back before going live again."
  ]},
  { id: "graphics", title: "Broadcast graphics, logo and captions", tags: "live bug logo ticker lower thirds on air graphic", steps: [
    "Open BROADCAST GRAPHICS and set up your lower third, topic, ticker, countdown, and corner logo.",
    "Graphics start OFF. Turn on an individual graphic only when you want it shown in the Program picture.",
    "The square corner LOGO BUG shows a small uploaded logo or fallback text. The LIVE BUG is a separate graphic.",
    "Use short, readable titles. Check the Program monitor and a test recording for correct positions and safe margins.",
    "Broadcast graphics are different from speech-to-text captions; do not assume that adding a lower third creates automatic closed captions."
  ]},
  { id: "record", title: "Recording, Program and ISO tracks", tags: "record output save download raw iso", steps: [
    "Open RECORDING and select an available recording mode: Program mix, ISO/source tracks, or both if your account offers those options.",
    "Program is the composed live picture. ISO is an individual source track you may use for editing later.",
    "Start recording and watch the recording status. Stop and wait for the app to finalize the files before closing or switching apps.",
    "Download the files your plan permits. Owner and customer rights or download options can differ.",
    "Keep adequate device storage and use a short rehearsal recording to catch missing video or sound."
  ]},
  { id: "replay", title: "Instant Replay and live recovery", tags: "replay hold freeze return", steps: [
    "Open INSTANT REPLAY if your production has a replay recording available.",
    "Choose the replay length, trigger the replay, and verify that the operator sees a clear replay state.",
    "After replay, confirm the application has returned to live Program.",
    "If a camera connection drops, keep the operator page open and check the source status while the application attempts to reconnect.",
    "Avoid restarting the whole production to fix one source unless necessary."
  ]},
  { id: "remote", title: "Remote controls and camera operators", tags: "remote zoom flip torch flashlight comms chat", steps: [
    "Camera operators can flip front/rear cameras, and use zoom or camera light where the device supports them.",
    "The Director can open supported remote-camera controls from the source tile, including zoom and flashlight.",
    "WALKIE-TALKIE and CAMERA COMMS appear in the Director menu where available.",
    "Use Live Shield and the phone's Do Not Disturb / Focus settings to reduce interruptions during filming.",
    "Browser permission and hardware capabilities vary, so unavailable controls may be disabled."
  ]},
  { id: "ai", title: "AI Studio templates and the video editor", tags: "AI Studio templates generate video edit credits", steps: [
    "Open AI STUDIO to choose an AI photo or video template; featured templates include original comedy, hotel-lobby duo and street performance concepts.",
    "Upload only photos you are authorized to use. Review required image counts, token costs and the generation preview.",
    "Generated clips depend on an external AI provider and may take processing time. The new featured video templates produce short clips, not an automatic full-length edited music video.",
    "Send a completed clip to the editor to arrange it with other media, audio, text and other supported editing tools.",
    "Use original or properly licensed music, footage and appearances."
  ]},
  { id: "output", title: "Broadcast output and external feeds", tags: "broadcast output stream OBS recording external feed", steps: [
    "Program is the finished mixed output. A camera in Preview alone is not on air.",
    "For external broadcasts, verify that your selected output or encoding workflow is configured and that the destination accepts your stream.",
    "Test picture, audio, and graphics on the receiving side, not just inside the Director monitor.",
    "Connecting an incoming camera is NOT the same action as sending your finished Program out to viewers.",
    "Direct third-party HLS/SRT/RTMP ingest and high-quality AI virtual-set replacement are separate planned upgrades; do not rely on them as existing features."
  ]},
  { id: "problems", title: "Troubleshooting: quick fixes", tags: "black screen no sound camera offline unsupported", steps: [
    "Black camera tile: check the source's camera/mic permission, browser tab, device power, and network.",
    "No sound: check MASTER AUDIO, the camera's mic permission/mute, and whether the source actually sends audio.",
    "Screen Share unsupported: some browsers and native iOS WebViews cannot capture other apps. Try a supported desktop browser.",
    "Wrong shot on air: confirm PREVIEW, then TAKE; inspect PROGRAM rather than assuming a Preview tap changed the output.",
    "No graphic visible: check whether its individual on/off switch is enabled and that the intended asset is loaded.",
    "TestFlight app not updated: check TestFlight for an Update after Apple has processed the new build. Cloudflare's web update is not an automatic native app install."
  ]}
];

function useHighlight(target, active) {
  const [rect, setRect] = useState(null);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const selectors = String(target || "").split("|");
    function refresh() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const elements = selectors.map(selector => document.querySelector(selector.trim())).filter(Boolean);
        const node = elements.find(element => element.getClientRects().length && element.getBoundingClientRect().height > 1);
        const b = node?.getBoundingClientRect();
        setRect(b ? { top: Math.max(3, b.top - 5), left: Math.max(3, b.left - 5), width: b.width + 10, height: b.height + 10 } : null);
      });
    }
    const node = selectors.map(selector => document.querySelector(selector.trim())).find(el => el?.getClientRects().length);
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
    refresh();
    const watcher = window.setTimeout(refresh, 420);
    window.addEventListener("scroll", refresh, true);
    window.addEventListener("resize", refresh);
    return () => {
      window.clearTimeout(watcher);
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", refresh, true);
      window.removeEventListener("resize", refresh);
    };
  }, [target, active]);
  return rect;
}

export function StudioGuideWelcome({ onOpen }) {
  const [visible, setVisible] = useState(() => {
    try { return window.localStorage.getItem("uds-guide-welcome-v1") !== "dismissed"; }
    catch { return true; }
  });
  function dismiss() {
    try { window.localStorage.setItem("uds-guide-welcome-v1", "dismissed"); } catch { /* storage may be blocked */ }
    setVisible(false);
  }
  if (!visible) return null;
  return (
    <aside className="studio-guide-welcome" aria-label="Welcome to Urban Director Studio">
      <span className="studio-guide-welcome-icon"><BookOpen size={20}/></span>
      <div><strong>New here? We can show you around.</strong><small>Follow a guided tour of the actual buttons or search the production manual. Nothing goes on air during the tour.</small></div>
      <button type="button" onClick={() => { dismiss(); onOpen(); }}>SHOW ME</button>
      <button type="button" onClick={dismiss} className="studio-guide-welcome-dismiss" aria-label="Dismiss welcome guide"><X size={16}/></button>
    </aside>
  );
}

export default function StudioGuide({ open, onClose }) {
  const [tourIndex, setTourIndex] = useState(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState("start");
  const searchRef = useRef(null);
  const activeTour = tourIndex !== null;
  const step = activeTour ? STUDIO_TOUR[tourIndex] : null;
  const highlight = useHighlight(step?.target, open && activeTour);
  const matches = useMemo(() => STUDIO_MANUAL.filter(topic => {
    const haystack = [topic.title, topic.tags, ...topic.steps].join(" ").toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  }), [query]);
  useEffect(() => {
    if (!open) { setTourIndex(null); return; }
    const handler = event => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (tourIndex !== null && event.key === "ArrowRight") setTourIndex(i => Math.min(STUDIO_TOUR.length - 1, i + 1));
      if (tourIndex !== null && event.key === "ArrowLeft") setTourIndex(i => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, tourIndex]);
  useEffect(() => { if (open && tourIndex === null) searchRef.current?.focus(); }, [open, tourIndex]);
  if (!open) return null;
  return (
    <div className={activeTour ? "studio-guide-layer is-touring" : "studio-guide-layer"} role="presentation">
      {activeTour ? (
        <>
          <div className="studio-guide-dim" aria-hidden="true"/>
          {highlight && <div className="studio-guide-highlight" aria-hidden="true" style={{
            top: highlight.top, left: highlight.left, width: highlight.width, height: highlight.height
          }}/>}
          <section className="studio-guide-tour-card" role="dialog" aria-modal="true" aria-label="Guided tour of Director Studio">
            <div className="studio-guide-heading">
              <span><CircleHelp size={16}/> GUIDED TOUR <b>{tourIndex + 1} / {STUDIO_TOUR.length}</b></span>
              <button type="button" aria-label="Close guided tour" onClick={onClose}><X size={19}/></button>
            </div>
            <h2>{step.title}</h2>
            <p>{step.caption}</p>
            <div className="studio-guide-progress" aria-hidden="true"><span style={{width: `${100 * (tourIndex + 1) / STUDIO_TOUR.length}%`}}/></div>
            <div className="studio-guide-tour-actions">
              <button type="button" className="studio-guide-plain" onClick={() => setTourIndex(null)}>FULL MANUAL</button>
              <button type="button" disabled={tourIndex === 0} onClick={() => setTourIndex(i => i - 1)}><ChevronLeft size={15}/> BACK</button>
              <button type="button" className="studio-guide-primary" onClick={() => tourIndex + 1 >= STUDIO_TOUR.length ? setTourIndex(null) : setTourIndex(i => i + 1)}>
                {tourIndex + 1 >= STUDIO_TOUR.length ? "FINISH" : "NEXT"} <ChevronRight size={15}/>
              </button>
            </div>
          </section>
        </>
      ) : (
        <div className="studio-guide-dialog-wrap" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
          <section className="studio-guide-manual" role="dialog" aria-modal="true" aria-label="Urban Director Studio help and production manual">
            <header className="studio-guide-manual-header">
              <div className="studio-guide-heading"><span><BookOpen size={19}/> URBAN DIRECTOR STUDIO</span><button type="button" aria-label="Close help" onClick={onClose}><X size={20}/></button></div>
              <h2>Production Guide</h2>
              <p>Every control, explained. Search the manual or take the on-screen tour that points to real controls.</p>
              <div className="studio-guide-search">
                <Search size={18}/>
                <input ref={searchRef} aria-label="Search production help" placeholder="Search: ingest, TAKE, audio, 9-CAM..." value={query} onChange={event => setQuery(event.target.value)}/>
              </div>
              <button type="button" className="studio-guide-start" onClick={() => setTourIndex(0)}>START GUIDED BUTTON TOUR <ChevronRight size={16}/></button>
            </header>
            <div className="studio-guide-topics">
              {matches.length === 0 && <p className="studio-guide-empty">No matches. Try “camera”, “ingest”, “Program”, or “recording”.</p>}
              {matches.map(topic => (
                <article className="studio-guide-topic" key={topic.id}>
                  <button type="button" aria-expanded={expanded === topic.id} onClick={() => setExpanded(expanded === topic.id ? "" : topic.id)}>
                    <strong>{topic.title}</strong><span>{expanded === topic.id ? "−" : "+"}</span>
                  </button>
                  {(expanded === topic.id || query.trim()) && <ol>{topic.steps.map((s,i) => <li key={i}>{s}</li>)}</ol>}
                </article>
              ))}
            </div>
            <footer className="studio-guide-footer">Read this anytime via MENU → TIPS / HELP. Features vary by device, plan and permissions.</footer>
          </section>
        </div>
      )}
    </div>
  );
}
