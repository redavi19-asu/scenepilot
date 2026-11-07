import { useEffect, useRef, useState } from "react";
import { sampleRange, sampleStore } from "./soundboardStorage";
import "./Soundboard.css";

const COLORS = ["#ff626e", "#ffa94d", "#f5d75d", "#56dfb0", "#59cfff", "#bc93ff"];
const emptyPads = () => COLORS.map((color, id) => ({ id, color, name: `PAD ${id + 1}`, start: 0, end: 0, loop: false }));

export default function Soundboard({ account, onStream, expanded, onToggle, standby }) {
  const [pads, setPads] = useState(emptyPads);
  const padsRef = useRef(pads);
  const [selected, setSelected] = useState(0);
  const [active, setActive] = useState([]);
  const [status, setStatus] = useState("Load your own sounds. Tap a loaded pad to play; tap again to stop.");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [monitor, setMonitor] = useState(true);
  const [recording, setRecording] = useState(false);
  const engine = useRef(null);
  const playing = useRef(new Map());
  const buffers = useRef(new Map());
  const recorder = useRef(null);
  const alive = useRef(false);
  const fileInput = useRef(null);

  useEffect(() => { padsRef.current = pads; }, [pads]);
  useEffect(() => {
    alive.current = true;
    const voices = playing.current;
    let canceled = false;
    Promise.all(COLORS.map((_, id) => sampleStore(account, "get", id))).then(saved => {
      if (canceled) return;
      setPads(emptyPads().map((pad, id) => saved[id] ? { ...pad, ...saved[id] } : pad));
      setReady(true);
    }).catch(() => {
      if (!canceled) { setReady(true); setStatus("Saved samples unavailable. New sounds can still play this session."); }
    });
    return () => {
      canceled = true;
      alive.current = false;
      for (const entry of voices.values()) entry.source.stop();
      voices.clear();
      recorder.current?.stream.getTracks().forEach(track => track.stop());
      if (recorder.current?.recorder.state === "recording") recorder.current.recorder.stop();
      if (engine.current) {
        engine.current.output.stream.getTracks().forEach(track => track.stop());
        void engine.current.context.close();
      }
    };
  }, [account]);

  function getEngine() {
    if (!engine.current) {
      const Constructor = window.AudioContext || window.webkitAudioContext;
      if (!Constructor) throw new Error("Audio sampling is unavailable on this device.");
      const context = new Constructor();
      const gain = context.createGain();
      const local = context.createGain();
      const output = context.createMediaStreamDestination();
      gain.gain.value = volume;
      local.gain.value = monitor ? 1 : 0;
      gain.connect(output);
      gain.connect(local);
      local.connect(context.destination);
      engine.current = { context, gain, local, output };
      onStream(output.stream);
    }
    return engine.current;
  }

  function stop(id) {
    const entry = playing.current.get(id);
    if (entry) { playing.current.delete(id); entry.source.stop(); }
    setActive([...playing.current.keys()]);
  }
  function stopAll() { for (const id of [...playing.current.keys()]) stop(id); }

  async function play(id) {
    setSelected(id);
    if (playing.current.has(id)) { stop(id); return; }
    const pad = padsRef.current[id];
    if (!pad.blob) { setStatus(`Select Load sound to fill pad ${id + 1}.`); return; }
    try {
      const { context, gain } = getEngine();
      // Reserve before async resume/decode so rapid repeat taps cancel safely.
      const entry = { source: { stop() {} } };
      playing.current.set(id, entry);
      await context.resume();
      let buffer = buffers.current.get(pad.blob);
      if (!buffer) {
        buffer = await context.decodeAudioData(await pad.blob.arrayBuffer());
        buffers.current.set(pad.blob, buffer);
      }
      if (!alive.current || playing.current.get(id) !== entry) return;
      const range = sampleRange(buffer.duration, pad.start, pad.end);
      const source = context.createBufferSource();
      entry.source = source;
      source.buffer = buffer;
      source.loop = pad.loop;
      source.loopStart = range.start;
      source.loopEnd = range.end;
      source.connect(gain);
      source.onended = () => {
        source.disconnect();
        if (playing.current.get(id) === entry) {
          playing.current.delete(id);
          if (alive.current) setActive([...playing.current.keys()]);
        }
      };
      if (pad.loop) source.start(0, range.start);
      else source.start(0, range.start, range.end - range.start);
      setActive([...playing.current.keys()]);
      setStatus(`${pad.name} playing${pad.loop ? " • loop" : ""}`);
    } catch (error) { stop(id); setStatus(error.message || "This sound could not play."); }
  }

  async function save(id, pad) {
    setPads(current => current.map(item => item.id === id ? pad : item));
    padsRef.current = padsRef.current.map(item => item.id === id ? pad : item);
    try { await sampleStore(account, "put", id, pad); }
    catch { setStatus("Sound is ready for this session, but could not be saved on this device."); }
  }

  async function load(blob, id, name) {
    setBusy(true);
    try {
      if (blob.size > 25 * 1024 * 1024) throw new Error("Choose a sound smaller than 25 MB.");
      const { context } = getEngine();
      const buffer = await context.decodeAudioData(await blob.arrayBuffer());
      if (!alive.current) return;
      if (buffer.duration > 120) throw new Error("Choose a sample up to two minutes long.");
      stop(id);
      const previous = padsRef.current[id];
      if (previous.blob) buffers.current.delete(previous.blob);
      buffers.current.set(blob, buffer);
      setStatus(`${name} loaded. Adjust Start and End to choose your sample.`);
      await save(id, { ...previous, blob, name, start: 0, end: buffer.duration, duration: buffer.duration, loop: false });
    } catch (error) { if (alive.current) setStatus(error.message || "Unsupported audio. Try MP3, WAV, or M4A."); }
    finally { if (alive.current) setBusy(false); }
  }

  async function recordSample() {
    if (recording) { recorder.current?.recorder.stop(); return; }
    setBusy(true);
    let stream;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error("Microphone sampling is unavailable. Load an audio file instead.");
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) { stream.getTracks().forEach(track => track.stop()); return; }
      const capture = new MediaRecorder(stream);
      const chunks = [];
      const id = selected;
      const timer = setTimeout(() => { if (capture.state === "recording") capture.stop(); }, 30000);
      capture.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      capture.onstop = () => {
        clearTimeout(timer);
        stream.getTracks().forEach(track => track.stop());
        recorder.current = null;
        if (!alive.current) return;
        setRecording(false);
        void load(new Blob(chunks, { type: capture.mimeType }), id, `MIC SAMPLE ${id + 1}`);
      };
      capture.onerror = () => { if (capture.state === "recording") capture.stop(); };
      recorder.current = { recorder: capture, stream };
      stopAll();
      capture.start();
      setRecording(true);
      setStatus(`Recording microphone into pad ${id + 1} • stops at 30 seconds.`);
    } catch (error) { stream?.getTracks().forEach(track => track.stop()); setStatus(error.message); }
    finally { setBusy(false); }
  }

  const pad = pads[selected];
  return <section className={`soundboard ${expanded ? "" : "soundboard-collapsed"}`} aria-label="Soundboard sampler">
    <button type="button" className="soundboard-heading" onClick={onToggle} aria-expanded={expanded}>
      <span><small>LIVE PERFORMANCE</small><strong>SOUNDBOARD</strong></span><span>{expanded ? "HIDE" : "SHOW"}</span>
    </button>
    <div className="soundboard-body">
      <p>Six sounds. Your timing. Load or record a sample, then tap to fire.</p>
      <div className="soundboard-pads">{pads.map(item => <div key={item.id} className="soundboard-slot" style={{ "--pad-color": item.color }}>
        <button type="button" className={`soundboard-pad ${active.includes(item.id) ? "playing" : ""} ${selected === item.id ? "selected" : ""}`}
          disabled={!ready || busy || recording} onClick={() => void play(item.id)} aria-label={`${item.name}: ${active.includes(item.id) ? "stop" : item.blob ? "play" : "empty"}`} aria-pressed={active.includes(item.id)}>
          <span className="soundboard-number">0{item.id + 1}<i/></span><strong>{item.name}</strong><small>{active.includes(item.id) ? "PLAYING • TAP TO STOP" : item.blob ? `${item.loop ? "LOOP" : "ONE SHOT"} • TAP TO PLAY` : "LOAD YOUR SOUND"}</small>
        </button>
        <button type="button" className="soundboard-edit" disabled={!ready || busy || recording} onClick={() => setSelected(item.id)}>Edit pad {item.id + 1}</button>
      </div>)}</div>
      <div className="soundboard-editor">
        <strong>PAD {selected + 1}</strong>
        <label>Name<input maxLength={32} value={pad.name} disabled={busy || recording} onChange={event => void save(selected, { ...pad, name: event.target.value })}/></label>
        <div className="soundboard-actions">
          <button type="button" disabled={!ready || busy || recording} onClick={() => fileInput.current.click()}>Load sound</button>
          <input ref={fileInput} type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm" hidden onChange={event => {
            const file = event.target.files?.[0]; event.target.value = "";
            if (file) void load(file, selected, file.name.replace(/\.[^.]+$/, "").slice(0, 32));
          }}/>
          <button type="button" disabled={busy || !ready} onClick={() => void recordSample()}>{recording ? "Stop recording" : "Record mic"}</button>
          <button type="button" disabled={!pad.blob || busy || recording} onClick={async () => {
            stop(selected); buffers.current.delete(pad.blob);
            await save(selected, emptyPads()[selected]);
          }}>Clear pad</button>
        </div>
        {pad.blob && <div className="soundboard-trim">
          <label>Start (sec)<input type="number" min="0" max={pad.duration} step="0.01" value={pad.start} disabled={busy || recording} onChange={event => { stop(selected); void save(selected, { ...pad, start: Number(event.target.value) }); }}/></label>
          <label>End (sec)<input type="number" min="0" max={pad.duration} step="0.01" value={pad.end} disabled={busy || recording} onChange={event => { stop(selected); void save(selected, { ...pad, end: Number(event.target.value) }); }}/></label>
          <label><input type="checkbox" checked={pad.loop} disabled={busy || recording} onChange={event => { stop(selected); void save(selected, { ...pad, loop: event.target.checked }); }}/>Loop</label>
        </div>}
      </div>
      <div className="soundboard-output">
        <label>Soundboard volume<input aria-label="Soundboard volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={event => {
          const value = Number(event.target.value); setVolume(value); if (engine.current) engine.current.gain.gain.value = value;
        }}/></label>
        <label><input type="checkbox" checked={monitor} onChange={event => { setMonitor(event.target.checked); if (engine.current) engine.current.local.gain.gain.value = event.target.checked ? 1 : 0; }}/>Local monitor</label>
        <button type="button" onClick={stopAll}>Stop all sounds</button>
      </div>
      <p role="status" aria-live="polite">{status}</p>
      <small>Sounds join Program recording and broadcast when Program is running. {standby ? "Standby: Program sound is muted." : "Use headphones to avoid microphone feedback."} Saved on this device for your account.</small>
    </div>
  </section>;
}
