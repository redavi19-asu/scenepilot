import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles, Coins, ImagePlus, Film, Upload, Download,
  Send, ChevronDown, X, RefreshCw, ShoppingBag, Check,
  Clapperboard, WandSparkles
} from "lucide-react";
import { apiFetch } from "./runtimeApi";
import "./AIStudio.css";

const FILTERS = [
  ["trending", "TRENDING"],
  ["photos", "AI PHOTOS"],
  ["video", "AI VIDEO"]
];

function sleep(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not read that photo."));
      image.src = String(reader.result || "");
    };
    reader.onerror = () => reject(new Error("Could not read that photo."));
    reader.readAsDataURL(file);
  });
}

async function imageFileToDataUrl(file) {
  if (!file?.type?.startsWith("image/")) {
    throw new Error("Choose a JPG, PNG, or WebP photo.");
  }

  const image = await readImage(file);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.86);
}

function templateTone(id) {
  const tones = {
    "lobby-duo": "lobby",
    "album-cover": "album",
    "studio-portrait": "studio",
    "street-campaign": "street",
    "luxury-night": "night",
    "movie-poster": "poster",
    "cinematic-motion": "motion",
    "premium-movie-scene": "movie"
  };
  return tones[id] || "studio";
}

function fileExtension(contentType, kind) {
  if (kind === "video") return "mp4";
  if (/png/i.test(contentType || "")) return "png";
  return "jpg";
}

export default function AIStudio() {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [studio, setStudio] = useState(null);
  const [filter, setFilter] = useState("trending");
  const [selectedId, setSelectedId] = useState("");
  const [photos, setPhotos] = useState([]);
  const [customPrompt, setCustomPrompt] = useState("");
  const [permission, setPermission] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeJob, setActiveJob] = useState(null);
  const [result, setResult] = useState(null);
  const [storeOpen, setStoreOpen] = useState(false);
  const pollRun = useRef(0);

  const templates = studio?.templates || [];
  const selected = templates.find(item => item.id === selectedId) || templates[0] || null;

  const visibleTemplates = useMemo(() => {
    if (filter === "trending") {
      return templates.filter(item => item.category === "trending" || item.badge === "POPULAR").concat(
        templates.filter(item => item.category === "video").slice(0, 2)
      );
    }
    return templates.filter(item => item.category === filter || item.kind === (filter === "video" ? "video" : "image"));
  }, [filter, templates]);

  async function loadStudio() {
    setLoading(true);
    try {
      const response = await apiFetch("/api/ai/studio", { headers: { Accept: "application/json" } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Director AI Studio could not load.");
      setStudio(data);
      setSelectedId(current => current || data.templates?.[0]?.id || "");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStudio();
    return () => {
      pollRun.current += 1;
    };
  }, []);

  useEffect(() => {
    setPhotos([]);
    setCustomPrompt("");
    setPermission(false);
    setStatus("");
    setResult(null);
    setActiveJob(null);
    pollRun.current += 1;
  }, [selectedId]);

  async function choosePhoto(index, file) {
    if (!file) return;
    setStatus("PREPARING PHOTO…");
    try {
      const dataUrl = await imageFileToDataUrl(file);
      setPhotos(current => {
        const next = [...current];
        next[index] = {
          name: file.name,
          dataUrl,
          previewUrl: dataUrl
        };
        return next.slice(0, selected?.maxImages || 1);
      });
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function removePhoto(index) {
    setPhotos(current => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function pollJob(jobId, runId) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (runId !== pollRun.current) return;
      await sleep(attempt < 5 ? 1800 : 3000);
      if (runId !== pollRun.current) return;

      try {
        const response = await apiFetch(`/api/ai/jobs/${encodeURIComponent(jobId)}`, {
          headers: { Accept: "application/json" }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok && response.status !== 202) {
          throw new Error(data.error || "Could not check AI generation.");
        }

        if (data.wallet) {
          setStudio(current => current ? { ...current, wallet: data.wallet } : current);
        }
        if (data.job) {
          setActiveJob(data.job);
          if (data.job.status === "queued") setStatus("GENERATOR QUEUED…");
          if (data.job.status === "generating") setStatus("AI IS BUILDING YOUR MEDIA…");
          if (data.job.status === "failed") {
            setStatus(data.job.error || "GENERATION FAILED • TOKENS RETURNED");
            setBusy(false);
            return;
          }
          if (data.job.status === "complete" && data.job.result) {
            setResult(data.job.result);
            setStatus("READY • SEND IT TO THE EDITOR OR SAVE IT");
            setBusy(false);
            void loadStudio();
            return;
          }
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
        setBusy(false);
        return;
      }
    }

    setStatus("GENERATION IS STILL RUNNING • CHECK MY GENERATIONS IN A MOMENT");
    setBusy(false);
  }

  async function generate() {
    if (!selected || busy) return;
    const readyPhotos = photos.filter(Boolean);
    if (readyPhotos.length < selected.minImages) {
      setStatus(`${selected.title.toUpperCase()} NEEDS ${selected.minImages} PHOTO${selected.minImages === 1 ? "" : "S"}.`);
      return;
    }
    if (!permission) {
      setStatus("CONFIRM YOU HAVE PERMISSION TO USE THE UPLOADED PHOTOS.");
      return;
    }
    if (!studio?.provider?.ready) {
      setStatus("GENERATOR IS WIRED • ADD FAL_KEY IN CLOUDFLARE TO TURN IT ON.");
      return;
    }
    if (!studio?.wallet?.unlimited && Number(studio?.wallet?.balance || 0) < selected.tokens) {
      setStoreOpen(true);
      setStatus("YOU NEED MORE DIRECTOR AI TOKENS FOR THIS TEMPLATE.");
      return;
    }

    setBusy(true);
    setResult(null);
    setStatus(`STARTING ${selected.title.toUpperCase()}…`);
    pollRun.current += 1;
    const runId = pollRun.current;

    try {
      const response = await apiFetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          templateId: selected.id,
          images: readyPhotos.map(item => item.dataUrl),
          customPrompt
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.code === "insufficient_tokens") setStoreOpen(true);
        throw new Error(data.error || "AI generation could not start.");
      }
      if (data.wallet) {
        setStudio(current => current ? { ...current, wallet: data.wallet } : current);
      }
      setActiveJob(data.job || null);
      setStatus("GENERATOR QUEUED…");
      void pollJob(data.job.id, runId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  async function fetchResultFile() {
    if (!activeJob?.id || !result) throw new Error("Generated media is not ready yet.");
    const response = await apiFetch(`/api/ai/jobs/${encodeURIComponent(activeJob.id)}/asset`);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Could not load generated media.");
    }
    const blob = await response.blob();
    const extension = fileExtension(blob.type || result.contentType, result.kind);
    const file = new File(
      [blob],
      `Director-AI-${selected?.title?.replace(/[^A-Za-z0-9]+/g, "-") || "Media"}-${Date.now()}.${extension}`,
      { type: blob.type || result.contentType || (result.kind === "video" ? "video/mp4" : "image/jpeg") }
    );
    return file;
  }

  async function sendToEditor() {
    setStatus("SENDING GENERATED MEDIA TO DIRECTOR EDIT…");
    try {
      const file = await fetchResultFile();
      const input = document.querySelector(
        '.nle-studio input[type="file"][multiple][accept*="video"]'
      );
      if (!input) throw new Error("Open Director Edit first, then send the AI media again.");
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      document.querySelector(".nle-studio")?.scrollIntoView({ behavior: "smooth", block: "start" });
      setStatus("ADDED TO DIRECTOR EDIT • READY ON THE TIMELINE");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function downloadResult() {
    setStatus("PREPARING DOWNLOAD…");
    try {
      const file = await fetchResultFile();
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("GENERATED MEDIA SAVED");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  if (loading && !studio) {
    return (
      <section className="ai-studio ai-studio-loading">
        <Sparkles size={20}/>
        <span>LOADING DIRECTOR AI STUDIO…</span>
      </section>
    );
  }

  return (
    <section className={`ai-studio ${open ? "open" : "collapsed"}`}>
      <button className="ai-studio-head" type="button" onClick={() => setOpen(value => !value)}>
        <div className="ai-studio-title">
          <span className="ai-studio-mark"><WandSparkles size={20}/></span>
          <div>
            <span className="eyebrow">URBAN DIRECTOR STUDIO</span>
            <strong>AI STUDIO</strong>
          </div>
        </div>
        <div className="ai-studio-head-actions">
          <span className="ai-token-pill">
            <Coins size={15}/>
            {studio?.wallet?.unlimited ? "OWNER • UNLIMITED" : `${Number(studio?.wallet?.balance || 0).toLocaleString()} TOKENS`}
          </span>
          <ChevronDown className={open ? "rotated" : ""} size={20}/>
        </div>
      </button>

      {open && (
        <div className="ai-studio-body">
          <div className="ai-studio-hero">
            <div>
              <span className="ai-kicker"><Sparkles size={14}/> CREATE WITH AI</span>
              <h2>Photos, scenes and cinematic video — then send it straight to Director Edit.</h2>
              <p>Pick a look, add your photos, spend the shown tokens, and generate. Your provider key stays on the Cloudflare Worker — never inside the app.</p>
            </div>
            <div className={`ai-provider-state ${studio?.provider?.ready ? "ready" : "waiting"}`}>
              <i/>
              <span>{studio?.provider?.ready ? "AI GENERATORS READY" : "WAITING FOR FAL_KEY"}</span>
            </div>
          </div>

          <div className="ai-filter-row">
            <div className="ai-filter-tabs">
              {FILTERS.map(([id, label]) => (
                <button
                  type="button"
                  key={id}
                  className={filter === id ? "active" : ""}
                  onClick={() => setFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button className="ai-buy-button" type="button" onClick={() => setStoreOpen(true)}>
              <ShoppingBag size={16}/> BUY TOKENS
            </button>
          </div>

          <div className="ai-template-grid">
            {visibleTemplates.map(template => (
              <button
                type="button"
                key={template.id}
                className={`ai-template-card tone-${templateTone(template.id)} ${selected?.id === template.id ? "selected" : ""}`}
                onClick={() => setSelectedId(template.id)}
              >
                <span className="ai-template-badge">{template.badge}</span>
                <span className="ai-template-art">
                  {template.kind === "video" ? <Film size={30}/> : <ImagePlus size={30}/>}
                </span>
                <span className="ai-template-copy">
                  <strong>{template.title}</strong>
                  <small>{template.subtitle}</small>
                </span>
                <span className="ai-template-price"><Coins size={13}/> {template.tokens}</span>
              </button>
            ))}
          </div>

          {selected && (
            <div className="ai-generator-panel">
              <div className="ai-generator-heading">
                <div>
                  <span>{selected.kind === "video" ? "AI VIDEO" : "AI PHOTOSHOOT"}</span>
                  <h3>{selected.title}</h3>
                  <p>{selected.subtitle}</p>
                </div>
                <div className="ai-generation-price">
                  <small>GENERATION COST</small>
                  <strong><Coins size={17}/> {selected.tokens}</strong>
                </div>
              </div>

              <div className="ai-workflow-grid">
                <div className="ai-upload-zone">
                  <div className="ai-step-title"><span>1</span> ADD {selected.minImages === selected.maxImages ? selected.minImages : `${selected.minImages}–${selected.maxImages}`} PHOTO{selected.maxImages === 1 ? "" : "S"}</div>
                  <div className="ai-photo-slots">
                    {Array.from({ length: selected.maxImages }, (_, index) => {
                      const photo = photos[index];
                      return (
                        <label className={`ai-photo-slot ${photo ? "filled" : ""}`} key={index}>
                          {photo ? (
                            <>
                              <img src={photo.previewUrl} alt={`Reference ${index + 1}`}/>
                              <button type="button" onClick={event => { event.preventDefault(); removePhoto(index); }} aria-label="Remove photo">
                                <X size={14}/>
                              </button>
                            </>
                          ) : (
                            <>
                              <Upload size={22}/>
                              <strong>PHOTO {index + 1}</strong>
                              <small>{index < selected.minImages ? "REQUIRED" : "OPTIONAL"}</small>
                            </>
                          )}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={event => void choosePhoto(index, event.target.files?.[0])}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="ai-direction-zone">
                  <div className="ai-step-title"><span>2</span> OPTIONAL DIRECTION</div>
                  <textarea
                    value={customPrompt}
                    maxLength={600}
                    onChange={event => setCustomPrompt(event.target.value)}
                    placeholder="Example: black jackets, night scene, slow camera push, serious mood…"
                  />
                  <label className="ai-permission-check">
                    <input
                      type="checkbox"
                      checked={permission}
                      onChange={event => setPermission(event.target.checked)}
                    />
                    <span className="ai-check-box">{permission && <Check size={13}/>}</span>
                    <span>I own these photos or have permission to use them for AI generation.</span>
                  </label>
                </div>
              </div>

              <button
                type="button"
                className="ai-generate-button"
                disabled={busy}
                onClick={() => void generate()}
              >
                {busy ? <RefreshCw className="spin" size={19}/> : <Sparkles size={19}/>} 
                {busy ? "GENERATING…" : `GENERATE • ${selected.tokens} TOKENS`}
              </button>

              {status && <div className="ai-status" role="status">{status}</div>}

              {result && (
                <div className="ai-result-card">
                  <div className="ai-result-preview">
                    {result.kind === "video" ? (
                      <video src={result.url} controls playsInline/>
                    ) : (
                      <img src={result.url} alt={`${result.title || selected.title} result`}/>
                    )}
                  </div>
                  <div className="ai-result-actions">
                    <div>
                      <span>GENERATION COMPLETE</span>
                      <strong>{result.title || selected.title}</strong>
                    </div>
                    <button type="button" className="primary" onClick={() => void sendToEditor()}>
                      <Send size={16}/> SEND TO EDITOR
                    </button>
                    <button type="button" onClick={() => void downloadResult()}>
                      <Download size={16}/> SAVE
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="ai-history-strip">
            <div className="ai-history-head">
              <span><Clapperboard size={15}/> MY GENERATIONS</span>
              <button type="button" onClick={() => void loadStudio()}><RefreshCw size={14}/> REFRESH</button>
            </div>
            <div className="ai-history-items">
              {(studio?.jobs || []).length ? studio.jobs.slice(0, 6).map(job => {
                const template = templates.find(item => item.id === job.templateId);
                return (
                  <div className="ai-history-item" key={job.id}>
                    <strong>{template?.title || job.templateId}</strong>
                    <span>{job.status.toUpperCase()} • {job.tokenCost} TOKENS</span>
                  </div>
                );
              }) : <span className="ai-history-empty">Your generated photos and videos will show up here.</span>}
            </div>
          </div>
        </div>
      )}

      {storeOpen && (
        <div className="ai-store-backdrop" onClick={() => setStoreOpen(false)}>
          <div className="ai-token-store" onClick={event => event.stopPropagation()}>
            <button type="button" className="ai-store-close" onClick={() => setStoreOpen(false)}><X size={19}/></button>
            <span className="ai-kicker"><Coins size={14}/> DIRECTOR AI TOKENS</span>
            <h3>Keep creating when the monthly tokens run out.</h3>
            <p>These pack IDs are wired for the store layer. The final purchase buttons turn on after the matching Google Play in-app products are created.</p>
            <div className="ai-pack-grid">
              {(studio?.tokenPacks || []).map(pack => (
                <button
                  type="button"
                  key={pack.id}
                  onClick={() => setStatus(`${pack.label.toUpperCase()} PACK • CREATE ${pack.id} IN GOOGLE PLAY TO ACTIVATE PURCHASES.`)}
                >
                  <small>{pack.label.toUpperCase()}</small>
                  <strong>{pack.tokens.toLocaleString()}</strong>
                  <span>TOKENS</span>
                  <b>{pack.priceLabel}</b>
                </button>
              ))}
            </div>
            <div className="ai-store-note">
              <Sparkles size={15}/>
              <span>Pro members receive {Number(studio?.wallet?.monthlyAllowance || 0).toLocaleString()} AI tokens each month. Failed generations are automatically refunded.</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
