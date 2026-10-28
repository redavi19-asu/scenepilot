import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles, Coins, ImagePlus, Film, Upload, Download,
  Send, ChevronDown, X, RefreshCw, ShoppingBag, Check,
  Clapperboard, WandSparkles, Play
} from "lucide-react";
import { apiFetch } from "./runtimeApi";
import { AI_TEMPLATE_ARTWORK } from "./aiTemplateArtwork";
import "./AIStudio.css";
import TemplatePreview from "./TemplatePreview";
import { TEMPLATE_REFERENCES, referenceThumbnail } from "./templateReferences";

const FILTERS = [
  ["featured", "FEATURED VIDEO"],
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
    "parents-store": "movie",
    "parents-neighbor": "movie",
    "lobby-music-video": "lobby",
    "street-freestyle-video": "street",
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
  const [reportJobId, setReportJobId] = useState(null);
  const [reportReason, setReportReason] = useState("");
  const reportFormRef = useRef(null);
  useEffect(() => { if (reportJobId) reportFormRef.current?.scrollIntoView({block:"center"}); }, [reportJobId]);
  const [reportSending, setReportSending] = useState(false);
  const [reports, setReports] = useState(null);
  async function reportGeneration(event) {
    event.preventDefault(); setReportSending(true);
    try {
      const response = await apiFetch(`/api/ai/jobs/${encodeURIComponent(reportJobId)}/report`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: reportReason })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Report could not be sent.");
      setReportJobId(null); setReportReason(""); setStatus("REPORT SENT FOR REVIEW");
    } catch (error) { setStatus(error.message); }
    finally { setReportSending(false); }
  }
  async function reviewReports() {
    try {
      const response = await apiFetch("/api/ai/reports"); const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Reports could not load.");
      setReports(data.reports);
    } catch (error) { setStatus(error.message); }
  }

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [studio, setStudio] = useState(null);
  const [filter, setFilter] = useState("featured");
  const [selectedId, setSelectedId] = useState("");
  const [photos, setPhotos] = useState([]);
  const [customPrompt, setCustomPrompt] = useState("");
  const [permission, setPermission] = useState(false);
  const [aiSharingConsent, setAiSharingConsent] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeJob, setActiveJob] = useState(null);
  const [result, setResult] = useState(null);
  const [storeOpen, setStoreOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const generatorRef = useRef(null);
  function chooseTemplate(id) { if (busy) return; setSelectedId(id); setGeneratorOpen(true); setPreviewItem(null); }
  useEffect(() => {
    const fold = () => { setOpen(false); setGeneratorOpen(false); setPreviewItem(null); setStoreOpen(false); };
    window.addEventListener('scenepilot:collapse-tools', fold);
    return () => window.removeEventListener('scenepilot:collapse-tools', fold);
  }, []);
  useEffect(() => {
    if (generatorOpen) generatorRef.current?.scrollIntoView({ block: 'start' });
  }, [generatorOpen, selectedId]);
  const pollRun = useRef(0);

  const templates = studio?.templates || [];

  const visibleTemplates = useMemo(() => {
    if (filter === "featured") return templates.filter(item => item.featured);
    if (filter === "trending") {
      return templates.filter(item => item.category === "trending" || item.badge === "POPULAR").concat(
        templates.filter(item => item.category === "video").slice(0, 2)
      );
    }
    return templates.filter(item => item.category === filter || item.kind === (filter === "video" ? "video" : "image"));
  }, [filter, templates]);

  const selected = visibleTemplates.find(item => item.id === selectedId) || visibleTemplates[0] || null;

  async function loadStudio() {
    setLoading(true);
    try {
      const response = await apiFetch("/api/ai/studio", { headers: { Accept: "application/json" } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Director AI Studio could not load.");
      setStudio(data);
      setSelectedId(current => current || data.templates?.find(item => item.featured)?.id || data.templates?.[0]?.id || "");
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
    setAiSharingConsent(false);
    setStatus("");
    setResult(null);
    setActiveJob(null);
    pollRun.current += 1;
  }, [selected?.id]);

  async function choosePhoto(index, file) {
    if (!file) return;
    setAiSharingConsent(false);
    setStatus("PREPARING PHOTO…");
    try {
      const dataUrl = await imageFileToDataUrl(file);
      setAiSharingConsent(false);
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
    setAiSharingConsent(false);
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
    if (!aiSharingConsent) {
      setStatus("AGREE TO SHARE THESE PHOTOS AND INSTRUCTIONS WITH FAL.AI BEFORE GENERATING.");
      return;
    }
    if (!studio?.provider?.ready) {
      setStatus("AI GENERATION IS TEMPORARILY UNAVAILABLE. PLEASE TRY AGAIN LATER.");
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
          customPrompt,
          aiSharingConsent: "fal-ai-v1"
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
      <button className="ai-studio-head" type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>
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
              <h2>Choose a look. Make it yours.</h2>
              <p>Watch an original reference for free, then choose a template and add your photos. Generation uses the tokens shown.</p>
            </div>
            <div className={`ai-provider-state ${studio?.provider?.ready ? "ready" : "waiting"}`}>
              <i/>
              <span>{studio?.provider?.ready ? "AI GENERATORS READY" : "GENERATORS UNAVAILABLE"}</span>
            </div>
          </div>

          <div className="ai-filter-row">
            <div className="ai-filter-tabs">
              {FILTERS.map(([id, label]) => (
                <button
                  type="button"
                  key={id}
                  className={filter === id ? "active" : ""}
                  disabled={busy}
                  onClick={() => setFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button className="ai-buy-button" type="button" onClick={() => setStoreOpen(true)}>
              <ShoppingBag size={16}/> AI CREDITS
            </button>
          </div>

          <div className="ai-template-grid">
            {visibleTemplates.map(template => {
              const reference = TEMPLATE_REFERENCES[template.id];
              const artwork = AI_TEMPLATE_ARTWORK[template.id];
              const preview = () => setPreviewItem({ template, reference, artwork });
              return <article key={template.id} className={`ai-template-card tone-${templateTone(template.id)} ${selected?.id === template.id && generatorOpen ? "selected" : ""}`}>
                <button type="button" className="ai-template-poster" onClick={preview} aria-label={`${reference ? "Preview" : artwork ? "View image for" : "About"} ${template.title}`}>
                  {artwork && <img className="ai-template-thumbnail" src={referenceThumbnail(reference) || `/${artwork.src}`} alt={reference ? reference.title : artwork.alt} loading="lazy" width="480" height="270"
                    onError={event => { event.currentTarget.style.visibility = "hidden"; event.currentTarget.parentElement.dataset.imageUnavailable = "true"; }}/>}
                  {artwork ? <span className="ai-preview-play">{reference ? <Play size={24}/> : <ImagePlus size={24}/>}</span> : <span className="ai-template-placeholder">{template.kind === "video" ? <Film size={30}/> : <ImagePlus size={30}/>}<small>Template details</small></span>}
                </button>
                <div className="ai-template-info"><strong>{template.title}</strong><small>{template.subtitle}</small>
                  {template.kind === "video" && <small>Generates {parseInt(template.duration, 10)} seconds</small>}
                  <span className="ai-reference-attribution">{reference ? `Original reference: ${reference.credit}` : "Illustrative concept"}</span>
                </div>
                <div className="ai-template-actions">
                  <button type="button" onClick={preview}>{reference ? 'Watch preview' : artwork ? 'View image' : 'Details'}</button>
                  <button type="button" disabled={busy} onClick={() => chooseTemplate(template.id)}>Use · {template.tokens} tokens</button>
                </div>
              </article>;
            })}
          </div>

          {selected && (
            <details ref={generatorRef} className="ai-generator-panel" open={generatorOpen} onToggle={event => setGeneratorOpen(event.currentTarget.open)}>
              <summary className="ai-generator-summary">Create: {selected.title}<ChevronDown size={18}/></summary>
              <div className="ai-generator-heading">
                <div>
                  <span>{selected.kind === "video" ? "AI VIDEO" : "AI PHOTOSHOOT"}</span>
                  <h3>{selected.title}</h3>
                  <p>{selected.subtitle}</p>
                  {selected.kind === "video" && <p>Generated clip: {parseInt(selected.duration, 10)} seconds</p>}
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
                    onChange={event => { setCustomPrompt(event.target.value); setAiSharingConsent(false); }}
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
                  <label className="ai-permission-check">
                    <input type="checkbox" checked={aiSharingConsent} onChange={event => setAiSharingConsent(event.target.checked)}/>
                    <span className="ai-check-box">{aiSharingConsent && <Check size={13}/>}</span>
                    <span>I agree to send these photos and instructions to fal.ai and its generation providers to create this result. They process and retain submitted media under their policies.</span>
                  </label>
                  <p><a href="https://fal.ai/privacy" target="_blank" rel="noopener noreferrer">fal.ai privacy policy</a> · <a href="/privacy" target="_blank" rel="noopener noreferrer">Urban Director Studio privacy policy</a></p>
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
                    <button type="button" onClick={() => { setReportJobId(activeJob?.id); setReportReason(""); }}>Report a problem</button>
                    <button type="button" onClick={() => void downloadResult()}>
                      <Download size={16}/> SAVE
                    </button>
                  </div>
                </div>
              )}
            </details>
          )}

              {status && <div className="ai-status" role="status">{status}</div>}

          <details className="ai-history-strip">
            <summary><Clapperboard size={16}/> My creations <span>{studio?.jobs?.length || 0}</span></summary>
            <p className="ai-section-help">Your saved generation jobs and their status. Failed jobs return their tokens.</p>
            <button className="ai-check-updates" type="button" disabled={loading} onClick={() => void loadStudio()}><RefreshCw size={16}/> {loading ? "Checking…" : "Check for updates"}</button>
            <div className="ai-history-items">
              {(studio?.jobs || []).length ? studio.jobs.slice(0, 6).map(job => {
                const template = templates.find(item => item.id === job.templateId);
                return (
                  <div className="ai-history-item" key={job.id}>
                    <strong>{template?.title || job.templateId}</strong>
                    <span>{job.status.toUpperCase()} • {job.tokenCost} TOKENS</span>
                    {job.status === "complete" && job.result?.url?.startsWith("https://") && <a className="ai-open-result" href={job.result.url} target="_blank" rel="noopener noreferrer">Open saved result</a>}
                    {job.status === "complete" && <button type="button" onClick={() => { setReportJobId(job.id); setReportReason(""); }}>Report a problem</button>}
                  </div>
                );
              }) : <span className="ai-history-empty">Your generated photos and videos will show up here.</span>}
            </div>
          </details>
              {reportJobId && <form onSubmit={reportGeneration} className="ai-status ai-report-form" ref={reportFormRef}>
                <label>What should we review about this result?<textarea value={reportReason} onChange={event => setReportReason(event.target.value)} minLength={5} maxLength={1000} required/></label>
                <button type="submit" disabled={reportSending}>SEND REPORT</button>
                <button type="button" disabled={reportSending} onClick={() => setReportJobId(null)}>CANCEL</button>
              </form>}
          {studio?.wallet?.unlimited && <details className="ai-admin-tools">
            <summary>Owner tools</summary>
            <p className="ai-section-help">Moderation reports submitted about generated content. These are not your creation history.</p>
            <button type="button" onClick={() => void reviewReports()}>Open content reports</button>
            {reports && <div className="ai-content-reports">
              {reports.length ? reports.map(item => <div key={item.id}><p>{item.reason}</p><small>{new Date(item.createdAt).toLocaleString()}</small>{item.result?.url?.startsWith("https://") && <a href={item.result.url} target="_blank" rel="noopener noreferrer">View reported result</a>}</div>) : <p>No content has been reported.</p>}
            </div>}
          </details>}
        </div>
      )}

      {previewItem && <TemplatePreview busy={busy} item={previewItem} onClose={() => setPreviewItem(null)} onUse={chooseTemplate}/>}

      {storeOpen && (
        <div className="ai-store-backdrop" onClick={() => setStoreOpen(false)}>
          <div className="ai-token-store" onClick={event => event.stopPropagation()}>
            <button type="button" className="ai-store-close" onClick={() => setStoreOpen(false)}><X size={19}/></button>
            <span className="ai-kicker"><Coins size={14}/> DIRECTOR AI TOKENS</span>
            <h3>Your monthly AI credits</h3>
            <p>Monthly AI credits are included with eligible Director plans. Additional token packs are not available yet.</p>
            <span>Pro members receive {Number(studio?.wallet?.monthlyAllowance || 0).toLocaleString()} AI tokens each month. Failed generations are automatically refunded.</span>
          </div>
        </div>
      )}
    </section>
  );
}
