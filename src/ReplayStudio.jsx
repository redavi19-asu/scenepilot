import { useEffect, useMemo, useRef, useState } from "react";
import {
  Upload, Film, Music2, Image, Type, Play, Pause, Scissors,
  Trash2, Copy, Undo2, Redo2, ZoomIn, ZoomOut, Download,
  MonitorUp, Save, Plus, Volume2, Gauge, SlidersHorizontal,
  Captions, Move, Palette, RotateCcw, FileDown
} from "lucide-react";
import "./ReplayStudio.css";

const TRACKS = [
  { id: "v2", label: "VIDEO 2", kind: "video" },
  { id: "v1", label: "VIDEO 1", kind: "video" },
  { id: "text", label: "TEXT / FX", kind: "overlay" },
  { id: "a1", label: "AUDIO 1", kind: "audio" },
  { id: "a2", label: "AUDIO 2", kind: "audio" }
];

const TRACK_HEIGHT = 54;
const BASE_PIXELS_PER_SECOND = 18;

function uid(prefix = "clip") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(seconds = 0) {
  const value = Math.max(0, Number(seconds) || 0);
  const mins = Math.floor(value / 60);
  const secs = Math.floor(value % 60);
  const frames = Math.floor((value % 1) * 30);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}

function getMediaDuration(file, url) {
  return new Promise(resolve => {
    if (file.type.startsWith("image/")) {
      resolve(5);
      return;
    }

    const element = document.createElement(
      file.type.startsWith("audio/") ? "audio" : "video"
    );
    element.preload = "metadata";
    element.src = url;

    const done = duration => {
      element.removeAttribute("src");
      element.load?.();
      resolve(Number.isFinite(duration) && duration > 0 ? duration : 10);
    };

    element.onloadedmetadata = () => done(element.duration);
    element.onerror = () => done(10);
  });
}

export default function ReplayStudio({ roomCode }) {
  const [open, setOpen] = useState(true);
  const [assets, setAssets] = useState([]);
  const [clips, setClips] = useState([]);
  const [selectedClipId, setSelectedClipId] = useState(null);
  const [playhead, setPlayhead] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [projectStatus, setProjectStatus] = useState("");
  const previewRef = useRef(null);
  const objectUrls = useRef(new Set());

  const pixelsPerSecond = BASE_PIXELS_PER_SECOND * zoom;
  const selectedClip = clips.find(clip => clip.id === selectedClipId) || null;

  const projectDuration = useMemo(() => {
    const clipEnd = clips.reduce(
      (max, clip) => Math.max(max, clip.start + clip.duration),
      60
    );
    return Math.min(Math.max(clipEnd + 10, 60), 600);
  }, [clips]);

  const timelineWidth = Math.max(900, projectDuration * pixelsPerSecond);

  useEffect(() => {
    return () => {
      objectUrls.current.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    const media = previewRef.current;
    if (!media || !selectedClip || selectedClip.kind !== "video") return;

    media.currentTime = Math.min(
      Math.max(selectedClip.inPoint + Math.max(0, playhead - selectedClip.start), selectedClip.inPoint),
      selectedClip.outPoint
    );
  }, [playhead, selectedClipId]);

  function snapshot(nextClips = clips) {
    setHistory(prev => [...prev.slice(-29), clips.map(clip => ({ ...clip }))]);
    setFuture([]);
    setClips(nextClips);
  }

  async function importFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const nextAssets = [];
    const nextClips = [...clips];
    let cursor = clips.reduce(
      (max, clip) => clip.trackId === "v1"
        ? Math.max(max, clip.start + clip.duration)
        : max,
      0
    );

    for (const file of files) {
      const url = URL.createObjectURL(file);
      objectUrls.current.add(url);
      const duration = await getMediaDuration(file, url);
      const kind = file.type.startsWith("audio/")
        ? "audio"
        : file.type.startsWith("image/")
          ? "image"
          : "video";
      const asset = {
        id: uid("asset"),
        name: file.name,
        file,
        url,
        kind,
        duration
      };
      nextAssets.push(asset);

      const trackId = kind === "audio" ? "a1" : "v1";
      const clip = {
        id: uid(),
        assetId: asset.id,
        name: file.name,
        url,
        kind,
        trackId,
        start: trackId === "v1" ? cursor : 0,
        duration,
        sourceDuration: duration,
        inPoint: 0,
        outPoint: duration,
        speed: 1,
        volume: 1,
        opacity: 1,
        scale: 1,
        x: 0,
        y: 0,
        rotation: 0,
        brightness: 1,
        contrast: 1,
        saturation: 1,
        fadeIn: 0,
        fadeOut: 0
      };
      nextClips.push(clip);
      if (trackId === "v1") cursor += duration;
    }

    setAssets(prev => [...prev, ...nextAssets]);
    snapshot(nextClips);
    setSelectedClipId(nextClips.at(-1)?.id || null);
  }

  function addAssetToTimeline(asset) {
    const trackId = asset.kind === "audio" ? "a1" : "v1";
    const end = clips.reduce(
      (max, clip) => clip.trackId === trackId
        ? Math.max(max, clip.start + clip.duration)
        : max,
      0
    );
    const clip = {
      id: uid(),
      assetId: asset.id,
      name: asset.name,
      url: asset.url,
      kind: asset.kind,
      trackId,
      start: end,
      duration: asset.duration,
      sourceDuration: asset.duration,
      inPoint: 0,
      outPoint: asset.duration,
      speed: 1,
      volume: 1,
      opacity: 1,
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0,
      brightness: 1,
      contrast: 1,
      saturation: 1,
      fadeIn: 0,
      fadeOut: 0
    };
    snapshot([...clips, clip]);
    setSelectedClipId(clip.id);
  }

  function addTextClip() {
    const clip = {
      id: uid("text"),
      name: "TITLE",
      kind: "text",
      trackId: "text",
      start: playhead,
      duration: 5,
      sourceDuration: 5,
      inPoint: 0,
      outPoint: 5,
      text: "Your title",
      textStyle: "title",
      speed: 1,
      volume: 0,
      opacity: 1,
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0
    };
    snapshot([...clips, clip]);
    setSelectedClipId(clip.id);
  }

  function addLowerThird() {
    const clip = {
      id: uid("lower-third"),
      name: "LOWER THIRD",
      kind: "text",
      trackId: "text",
      start: playhead,
      duration: 6,
      sourceDuration: 6,
      inPoint: 0,
      outPoint: 6,
      text: "NAME • ROLE / LOCATION",
      textStyle: "lower-third",
      speed: 1,
      volume: 0,
      opacity: 1,
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0
    };
    snapshot([...clips, clip]);
    setSelectedClipId(clip.id);
  }

  function addCaption() {
    const clip = {
      id: uid("caption"),
      name: "CAPTION",
      kind: "text",
      trackId: "text",
      start: playhead,
      duration: 4,
      sourceDuration: 4,
      inPoint: 0,
      outPoint: 4,
      text: "Type caption text",
      textStyle: "caption",
      speed: 1,
      volume: 0,
      opacity: 1,
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0
    };
    snapshot([...clips, clip]);
    setSelectedClipId(clip.id);
  }

  function resetVisuals() {
    if (!selectedClip) return;
    updateClip(selectedClip.id, {
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0,
      brightness: 1,
      contrast: 1,
      saturation: 1,
      opacity: 1
    });
  }

  function saveProject() {
    const serializableAssets = assets.map(asset => ({
      id: asset.id,
      name: asset.name,
      kind: asset.kind,
      duration: asset.duration
    }));
    const payload = {
      version: 1,
      product: "ScenePilot Edit",
      roomCode,
      aspectRatio,
      savedAt: new Date().toISOString(),
      assets: serializableAssets,
      clips: clips.map(({ file, ...clip }) => ({ ...clip, url: "" }))
    };

    window.localStorage.setItem(
      `scenepilot:edit:${roomCode || "default"}`,
      JSON.stringify(payload)
    );
    setProjectStatus("PROJECT EDIT SAVED LOCALLY");
  }

  function downloadProject() {
    const payload = {
      version: 1,
      product: "ScenePilot Edit",
      roomCode,
      aspectRatio,
      exportedAt: new Date().toISOString(),
      clips: clips.map(clip => ({
        ...clip,
        url: undefined,
        assetId: clip.assetId || null
      })),
      media: assets.map(asset => ({
        id: asset.id,
        name: asset.name,
        kind: asset.kind,
        duration: asset.duration
      }))
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `scenepilot-${roomCode || "project"}-${Date.now()}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setProjectStatus("PROJECT FILE EXPORTED");
  }

  function updateClip(id, updates, pushHistory = true) {
    const next = clips.map(clip =>
      clip.id === id ? { ...clip, ...updates } : clip
    );
    if (pushHistory) snapshot(next);
    else setClips(next);
  }

  function deleteSelected() {
    if (!selectedClip) return;
    snapshot(clips.filter(clip => clip.id !== selectedClip.id));
    setSelectedClipId(null);
  }

  function duplicateSelected() {
    if (!selectedClip) return;
    const copy = {
      ...selectedClip,
      id: uid(),
      start: selectedClip.start + selectedClip.duration + 0.25,
      name: `${selectedClip.name} COPY`
    };
    snapshot([...clips, copy]);
    setSelectedClipId(copy.id);
  }

  function splitSelected() {
    if (!selectedClip) return;
    const splitAt = playhead - selectedClip.start;
    if (splitAt <= 0.05 || splitAt >= selectedClip.duration - 0.05) return;

    const sourceSplit = selectedClip.inPoint + splitAt * selectedClip.speed;
    const left = {
      ...selectedClip,
      duration: splitAt,
      outPoint: sourceSplit
    };
    const right = {
      ...selectedClip,
      id: uid(),
      start: playhead,
      duration: selectedClip.duration - splitAt,
      inPoint: sourceSplit
    };
    snapshot([
      ...clips.filter(clip => clip.id !== selectedClip.id),
      left,
      right
    ]);
    setSelectedClipId(right.id);
  }

  function undo() {
    if (!history.length) return;
    const previous = history.at(-1);
    setFuture(prev => [clips.map(clip => ({ ...clip })), ...prev]);
    setClips(previous);
    setHistory(prev => prev.slice(0, -1));
    setSelectedClipId(null);
  }

  function redo() {
    if (!future.length) return;
    const next = future[0];
    setHistory(prev => [...prev, clips.map(clip => ({ ...clip }))]);
    setClips(next);
    setFuture(prev => prev.slice(1));
    setSelectedClipId(null);
  }

  function seekFromEvent(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const scrollLeft = event.currentTarget.scrollLeft || 0;
    const x = event.clientX - rect.left + scrollLeft;
    setPlayhead(Math.max(0, Math.min(projectDuration, x / pixelsPerSecond)));
  }

  function handleClipDragEnd(event, clip) {
    const lane = event.currentTarget.closest(".nle-lane-scroll");
    if (!lane) return;
    const rect = lane.getBoundingClientRect();
    const x = event.clientX - rect.left + lane.scrollLeft;
    const nextStart = Math.max(0, x / pixelsPerSecond - clip.duration / 2);
    updateClip(clip.id, { start: nextStart });
  }

  const previewClip = selectedClip?.kind === "video" || selectedClip?.kind === "image"
    ? selectedClip
    : clips.find(clip =>
        ["video", "image"].includes(clip.kind) &&
        playhead >= clip.start &&
        playhead <= clip.start + clip.duration
      );

  const activeText = clips.find(clip =>
    clip.kind === "text" &&
    playhead >= clip.start &&
    playhead <= clip.start + clip.duration
  );

  const previewStyle = previewClip ? {
    opacity: previewClip.opacity ?? 1,
    transform: `translate(${previewClip.x || 0}%, ${previewClip.y || 0}%) scale(${previewClip.scale || 1}) rotate(${previewClip.rotation || 0}deg)`,
    filter: `brightness(${previewClip.brightness ?? 1}) contrast(${previewClip.contrast ?? 1}) saturate(${previewClip.saturation ?? 1})`
  } : undefined;

  return (
    <section className="replay-studio nle-studio">
      <div className="replay-head">
        <div>
          <span className="eyebrow">SCENEPILOT EDIT</span>
          <strong>PRO EDITOR + REPLAY STUDIO</strong>
        </div>
        <div className="replay-head-actions">
          <span className="server-ready-badge">LOCAL EDITING ACTIVE</span>
          <button onClick={() => setOpen(value => !value)}>
            {open ? "HIDE EDITOR" : "OPEN EDITOR"}
          </button>
        </div>
      </div>

      {open && (
        <div className="nle-shell">
          <aside className="nle-sidebar">
            <div className="panel-label">MEDIA</div>
            <label className="nle-import">
              <Upload size={18}/>
              IMPORT MEDIA
              <input
                type="file"
                multiple
                accept="video/*,audio/*,image/*"
                onChange={event => {
                  importFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>

            <button className="nle-add-title" onClick={addTextClip}>
              <Type size={17}/> ADD TITLE
            </button>
            <button className="nle-add-title" onClick={addLowerThird}>
              <MonitorUp size={17}/> LOWER THIRD
            </button>
            <button className="nle-add-title" onClick={addCaption}>
              <Captions size={17}/> CAPTION
            </button>

            <div className="nle-bin">
              {assets.length ? assets.map(asset => (
                <button
                  className="nle-asset"
                  key={asset.id}
                  onDoubleClick={() => addAssetToTimeline(asset)}
                  onClick={() => addAssetToTimeline(asset)}
                >
                  <span className="nle-asset-icon">
                    {asset.kind === "audio"
                      ? <Music2 size={18}/>
                      : asset.kind === "image"
                        ? <Image size={18}/>
                        : <Film size={18}/>}
                  </span>
                  <span className="nle-asset-copy">
                    <strong>{asset.name}</strong>
                    <small>{asset.kind.toUpperCase()} • {formatTime(asset.duration)}</small>
                  </span>
                  <Plus size={14}/>
                </button>
              )) : (
                <div className="nle-empty-bin">
                  <Film size={30}/>
                  <strong>Import your footage</strong>
                  <span>Video, audio and images stay on this device while editing.</span>
                </div>
              )}
            </div>

            <div className="library-footer">
              <span>ROOM {roomCode}</span>
              <span>{assets.length} MEDIA</span>
            </div>
          </aside>

          <div className="nle-main">
            <div className="nle-top">
              <div className={`nle-preview aspect-${aspectRatio.replace(":", "-")}`}>
                {previewClip?.kind === "video" ? (
                  <video
                    key={previewClip.id}
                    ref={previewRef}
                    src={previewClip.url}
                    playsInline
                    controls
                    style={previewStyle}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onTimeUpdate={event => {
                      if (!playing) return;
                      const local = event.currentTarget.currentTime - previewClip.inPoint;
                      setPlayhead(previewClip.start + Math.max(0, local));
                    }}
                  />
                ) : previewClip?.kind === "image" ? (
                  <img src={previewClip.url} alt="" style={previewStyle} />
                ) : (
                  <div className="editor-preview-placeholder">
                    <Play size={42}/>
                    <strong>PROGRAM EDIT PREVIEW</strong>
                    <span>Import media or select a timeline clip.</span>
                  </div>
                )}

                {activeText && (
                  <div
                    className={`nle-text-overlay ${activeText.textStyle || "title"}`}
                    style={{
                      opacity: activeText.opacity,
                      transform: `translate(calc(-50% + ${activeText.x || 0}px), ${activeText.y || 0}px) scale(${activeText.scale || 1}) rotate(${activeText.rotation || 0}deg)`
                    }}
                  >
                    {activeText.text}
                  </div>
                )}

                <span className="editor-timecode">{formatTime(playhead)}</span>
              </div>

              <aside className="nle-inspector">
                <div className="panel-label">INSPECTOR</div>
                {selectedClip ? (
                  <>
                    <strong className="inspector-title">{selectedClip.name}</strong>

                    {selectedClip.kind === "text" && (
                      <label>
                        TEXT
                        <input
                          value={selectedClip.text || ""}
                          onChange={event =>
                            updateClip(selectedClip.id, { text: event.target.value }, false)
                          }
                          onBlur={() => snapshot(clips)}
                        />
                      </label>
                    )}

                    <label>
                      START
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={selectedClip.start.toFixed(1)}
                        onChange={event =>
                          updateClip(selectedClip.id, {
                            start: Math.max(0, Number(event.target.value) || 0)
                          }, false)
                        }
                      />
                    </label>

                    <label>
                      DURATION
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={selectedClip.duration.toFixed(1)}
                        onChange={event =>
                          updateClip(selectedClip.id, {
                            duration: Math.max(0.1, Number(event.target.value) || 0.1)
                          }, false)
                        }
                      />
                    </label>

                    {selectedClip.kind !== "text" && (
                      <>
                        <label>
                          IN POINT
                          <input
                            type="number"
                            min="0"
                            max={selectedClip.sourceDuration}
                            step="0.1"
                            value={(selectedClip.inPoint || 0).toFixed(1)}
                            onChange={event => {
                              const nextIn = Math.max(0, Math.min(Number(event.target.value) || 0, selectedClip.outPoint - .1));
                              updateClip(selectedClip.id, {
                                inPoint: nextIn,
                                duration: Math.max(.1, (selectedClip.outPoint - nextIn) / selectedClip.speed)
                              }, false);
                            }}
                          />
                        </label>

                        <label>
                          OUT POINT
                          <input
                            type="number"
                            min="0.1"
                            max={selectedClip.sourceDuration}
                            step="0.1"
                            value={(selectedClip.outPoint || selectedClip.sourceDuration).toFixed(1)}
                            onChange={event => {
                              const nextOut = Math.min(selectedClip.sourceDuration, Math.max(Number(event.target.value) || .1, selectedClip.inPoint + .1));
                              updateClip(selectedClip.id, {
                                outPoint: nextOut,
                                duration: Math.max(.1, (nextOut - selectedClip.inPoint) / selectedClip.speed)
                              }, false);
                            }}
                          />
                        </label>

                        <label>
                          SPEED
                          <select
                            value={selectedClip.speed}
                            onChange={event =>
                              updateClip(selectedClip.id, {
                                speed: Number(event.target.value)
                              })
                            }
                          >
                            <option value="0.25">0.25×</option>
                            <option value="0.5">0.5×</option>
                            <option value="1">1×</option>
                            <option value="1.5">1.5×</option>
                            <option value="2">2×</option>
                          </select>
                        </label>

                        <label>
                          OPACITY {Math.round((selectedClip.opacity ?? 1) * 100)}%
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={selectedClip.opacity ?? 1}
                            onChange={event =>
                              updateClip(selectedClip.id, {
                                opacity: Number(event.target.value)
                              }, false)
                            }
                          />
                        </label>

                        <div className="inspector-section"><Move size={12}/> TRANSFORM</div>
                        <label>
                          SCALE {Math.round((selectedClip.scale ?? 1) * 100)}%
                          <input type="range" min=".25" max="3" step=".05"
                            value={selectedClip.scale ?? 1}
                            onChange={event => updateClip(selectedClip.id, { scale: Number(event.target.value) }, false)}
                          />
                        </label>
                        <label>
                          X POSITION
                          <input type="range" min="-100" max="100" step="1"
                            value={selectedClip.x ?? 0}
                            onChange={event => updateClip(selectedClip.id, { x: Number(event.target.value) }, false)}
                          />
                        </label>
                        <label>
                          Y POSITION
                          <input type="range" min="-100" max="100" step="1"
                            value={selectedClip.y ?? 0}
                            onChange={event => updateClip(selectedClip.id, { y: Number(event.target.value) }, false)}
                          />
                        </label>
                        <label>
                          ROTATION {Math.round(selectedClip.rotation ?? 0)}°
                          <input type="range" min="-180" max="180" step="1"
                            value={selectedClip.rotation ?? 0}
                            onChange={event => updateClip(selectedClip.id, { rotation: Number(event.target.value) }, false)}
                          />
                        </label>

                        {selectedClip.kind !== "audio" && (
                          <>
                            <div className="inspector-section"><Palette size={12}/> COLOR</div>
                            <label>
                              BRIGHTNESS {Math.round((selectedClip.brightness ?? 1) * 100)}%
                              <input type="range" min=".25" max="2" step=".05"
                                value={selectedClip.brightness ?? 1}
                                onChange={event => updateClip(selectedClip.id, { brightness: Number(event.target.value) }, false)}
                              />
                            </label>
                            <label>
                              CONTRAST {Math.round((selectedClip.contrast ?? 1) * 100)}%
                              <input type="range" min=".25" max="2" step=".05"
                                value={selectedClip.contrast ?? 1}
                                onChange={event => updateClip(selectedClip.id, { contrast: Number(event.target.value) }, false)}
                              />
                            </label>
                            <label>
                              SATURATION {Math.round((selectedClip.saturation ?? 1) * 100)}%
                              <input type="range" min="0" max="2" step=".05"
                                value={selectedClip.saturation ?? 1}
                                onChange={event => updateClip(selectedClip.id, { saturation: Number(event.target.value) }, false)}
                              />
                            </label>
                          </>
                        )}

                        <button className="inspector-reset" type="button" onClick={resetVisuals}>
                          <RotateCcw size={12}/> RESET VISUALS
                        </button>
                      </>
                    )}

                    {(selectedClip.kind === "audio" || selectedClip.kind === "video") && (
                      <>
                        <div className="inspector-section"><Volume2 size={12}/> AUDIO</div>
                        <label>
                          VOLUME {Math.round((selectedClip.volume ?? 1) * 100)}%
                          <input
                            type="range"
                            min="0"
                            max="2"
                            step="0.05"
                            value={selectedClip.volume ?? 1}
                            onChange={event =>
                              updateClip(selectedClip.id, {
                                volume: Number(event.target.value)
                              }, false)
                            }
                          />
                        </label>
                        <label>
                          FADE IN {(selectedClip.fadeIn ?? 0).toFixed(1)}s
                          <input type="range" min="0" max="5" step=".1"
                            value={selectedClip.fadeIn ?? 0}
                            onChange={event => updateClip(selectedClip.id, { fadeIn: Number(event.target.value) }, false)}
                          />
                        </label>
                        <label>
                          FADE OUT {(selectedClip.fadeOut ?? 0).toFixed(1)}s
                          <input type="range" min="0" max="5" step=".1"
                            value={selectedClip.fadeOut ?? 0}
                            onChange={event => updateClip(selectedClip.id, { fadeOut: Number(event.target.value) }, false)}
                          />
                        </label>
                      </>
                    )}

                    {selectedClip.kind === "text" && (
                      <>
                        <label>
                          STYLE
                          <select
                            value={selectedClip.textStyle || "title"}
                            onChange={event => updateClip(selectedClip.id, { textStyle: event.target.value })}
                          >
                            <option value="title">TITLE</option>
                            <option value="lower-third">LOWER THIRD</option>
                            <option value="caption">CAPTION</option>
                          </select>
                        </label>
                        <label>
                          SCALE {Math.round((selectedClip.scale ?? 1) * 100)}%
                          <input type="range" min=".5" max="2" step=".05"
                            value={selectedClip.scale ?? 1}
                            onChange={event => updateClip(selectedClip.id, { scale: Number(event.target.value) }, false)}
                          />
                        </label>
                      </>
                    )}
                  </>
                ) : (
                  <div className="nle-inspector-empty">
                    <SlidersHorizontal size={26}/>
                    <span>Select a timeline clip to edit its properties.</span>
                  </div>
                )}
              </aside>
            </div>

            <div className="nle-toolbar">
              <button onClick={undo} disabled={!history.length}><Undo2 size={16}/> UNDO</button>
              <button onClick={redo} disabled={!future.length}><Redo2 size={16}/> REDO</button>
              <button onClick={splitSelected} disabled={!selectedClip}><Scissors size={16}/> SPLIT</button>
              <button onClick={duplicateSelected} disabled={!selectedClip}><Copy size={16}/> DUPLICATE</button>
              <button onClick={deleteSelected} disabled={!selectedClip}><Trash2 size={16}/> DELETE</button>
              <button onClick={() => setZoom(value => Math.max(.5, value - .25))}><ZoomOut size={16}/></button>
              <span className="nle-zoom-readout">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(value => Math.min(3, value + .25))}><ZoomIn size={16}/></button>
              <select
                className="nle-aspect-select"
                value={aspectRatio}
                onChange={event => setAspectRatio(event.target.value)}
                title="Project aspect ratio"
              >
                <option value="16:9">16:9 LANDSCAPE</option>
                <option value="9:16">9:16 VERTICAL</option>
                <option value="1:1">1:1 SQUARE</option>
                <option value="4:5">4:5 SOCIAL</option>
              </select>
              <button onClick={saveProject}><Save size={16}/> SAVE PROJECT</button>
              <button onClick={() => setPlayhead(selectedClip?.start || playhead)} disabled={!selectedClip}>
                <MonitorUp size={16}/> PREVIEW CLIP
              </button>
              <button onClick={downloadProject}><FileDown size={16}/> EXPORT PROJECT</button>
            </div>

            <div className="nle-timeline-wrap">
              <div
                className="nle-lane-scroll"
                onDoubleClick={seekFromEvent}
              >
                <div
                  className="nle-timeline"
                  style={{ width: timelineWidth }}
                >
                  <div className="nle-ruler">
                    {Array.from(
                      { length: Math.floor(projectDuration / 5) + 1 },
                      (_, index) => index * 5
                    ).map(second => (
                      <span
                        key={second}
                        style={{ left: second * pixelsPerSecond }}
                      >
                        {formatTime(second).slice(0, 5)}
                      </span>
                    ))}
                  </div>

                  {TRACKS.map(track => (
                    <div className="nle-track-row" key={track.id}>
                      <div className="nle-track-label">{track.label}</div>
                      <div className="nle-track-lane">
                        {clips
                          .filter(clip => clip.trackId === track.id)
                          .map(clip => (
                            <button
                              key={clip.id}
                              draggable
                              className={`nle-clip ${clip.kind} ${selectedClipId === clip.id ? "selected" : ""}`}
                              style={{
                                left: clip.start * pixelsPerSecond,
                                width: Math.max(40, clip.duration * pixelsPerSecond)
                              }}
                              onClick={event => {
                                event.stopPropagation();
                                setSelectedClipId(clip.id);
                                setPlayhead(clip.start);
                              }}
                              onDragEnd={event => handleClipDragEnd(event, clip)}
                              title={`${clip.name} • ${formatTime(clip.duration)}`}
                            >
                              <span>{clip.name}</span>
                              <small>{formatTime(clip.duration)}</small>
                            </button>
                          ))}
                      </div>
                    </div>
                  ))}

                  <div
                    className="nle-playhead"
                    style={{ left: 92 + playhead * pixelsPerSecond }}
                  >
                    <i/>
                  </div>
                </div>
              </div>
            </div>

            {projectStatus && <div className="nle-project-status">{projectStatus}</div>}

            <div className="editor-note">
              <strong>SCENEPILOT EDIT ACTIVE:</strong>
              Multi-track editing, trim/split, speed, transform, color, opacity, audio levels/fades,
              titles, lower thirds, captions, aspect presets, local project save and project export are active.
              Final rendered movie export will connect to the native iOS/Android/Desktop media layer.
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
