import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BadgeInfo, Clock3, ImagePlus, Layers3, Radio,
  RotateCcw, Save, ScrollText, Upload, X
} from "lucide-react";
import "./BroadcastGraphics.css";

const INITIAL = {
  live: true,
  lowerThird: false,
  ticker: false,
  countdown: false,
  topic: false,
  logo: true,
  headline: "COMING UP",
  subheadline: "Live coverage continues shortly",
  tickerText: "ScenePilot live production • Add updates, headlines, alerts, or event information here",
  countdownLabel: "NEWS CONFERENCE",
  countdownMinutes: 10,
  logoText: "SP",
  topicSide: "right"
};

function formatTime(totalSeconds) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function BroadcastGraphics() {
  const [graphics, setGraphics] = useState(INITIAL);
  const [programTarget, setProgramTarget] = useState(null);
  const [remaining, setRemaining] = useState(INITIAL.countdownMinutes * 60);
  const [counting, setCounting] = useState(false);
  const [topicImage, setTopicImage] = useState("");
  const [logoImage, setLogoImage] = useState("");
  const topicUrl = useRef("");
  const logoUrl = useRef("");

  useEffect(() => {
    const findTarget = () => {
      const target = document.querySelector(".program-monitor .screen");
      if (target) setProgramTarget(target);
    };
    findTarget();
    const timer = window.setInterval(findTarget, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!counting || remaining <= 0) return;
    const timer = window.setInterval(() => {
      setRemaining(value => {
        if (value <= 1) {
          setCounting(false);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [counting, remaining]);

  useEffect(() => () => {
    if (topicUrl.current) URL.revokeObjectURL(topicUrl.current);
    if (logoUrl.current) URL.revokeObjectURL(logoUrl.current);
  }, []);

  const activeCount = useMemo(() => (
    ["live", "lowerThird", "ticker", "countdown", "topic", "logo"]
      .filter(key => graphics[key]).length
  ), [graphics]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("scenepilot:graphics-state", {
      detail: {
        graphics,
        remaining,
        topicImage,
        logoImage,
        now: Date.now()
      }
    }));
  }, [graphics, remaining, topicImage, logoImage]);

  function setValue(key, value) {
    setGraphics(current => ({ ...current, [key]: value }));
  }

  function toggle(key) {
    setGraphics(current => ({ ...current, [key]: !current[key] }));
  }

  function loadImage(event, type) {
    const file = event.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);

    if (type === "topic") {
      if (topicUrl.current) URL.revokeObjectURL(topicUrl.current);
      topicUrl.current = url;
      setTopicImage(url);
      setValue("topic", true);
    } else {
      if (logoUrl.current) URL.revokeObjectURL(logoUrl.current);
      logoUrl.current = url;
      setLogoImage(url);
      setValue("logo", true);
    }
    event.target.value = "";
  }

  function resetCountdown() {
    setCounting(false);
    setRemaining(Math.max(0, Number(graphics.countdownMinutes) || 0) * 60);
  }

  function startCountdown() {
    if (remaining <= 0) {
      setRemaining(Math.max(0, Number(graphics.countdownMinutes) || 0) * 60);
    }
    setValue("countdown", true);
    setCounting(true);
  }

  const overlay = (
    <div className="sp-graphics-overlay" aria-hidden="true">
      {graphics.topic && topicImage && (
        <div className={`sp-topic-card ${graphics.topicSide}`}>
          <img src={topicImage} alt=""/>
        </div>
      )}

      <div className="sp-top-bugs">
        {graphics.live && (
          <div className="sp-live-bug"><i/> LIVE</div>
        )}
        {graphics.countdown && (
          <div className="sp-countdown-bug">
            <span>{graphics.countdownLabel || "COMING UP"}</span>
            <strong>{formatTime(remaining)}</strong>
          </div>
        )}
      </div>

      {graphics.logo && (
        <div className="sp-logo-bug">
          {logoImage
            ? <img src={logoImage} alt=""/>
            : <strong>{graphics.logoText || "SP"}</strong>}
        </div>
      )}

      <div className="sp-lower-stack">
        {graphics.lowerThird && (
          <div className="sp-lower-third">
            <span>{graphics.headline || "COMING UP"}</span>
            <strong>{graphics.subheadline || "Live coverage continues shortly"}</strong>
          </div>
        )}

        {graphics.ticker && (
          <div className="sp-ticker">
            <span className="sp-ticker-label">UPDATE</span>
            <div className="sp-ticker-window">
              <div className="sp-ticker-track">
                <span>{graphics.tickerText}</span>
                <span>{graphics.tickerText}</span>
              </div>
            </div>
            <time>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {programTarget && createPortal(overlay, programTarget)}

      <section className="sp-graphics-panel">
        <div className="sp-graphics-head">
          <div>
            <span className="eyebrow">ON-AIR GRAPHICS</span>
            <strong>BROADCAST GRAPHICS</strong>
            <small>TV-style overlays placed directly on the Program output.</small>
          </div>
          <div className="sp-graphics-status">
            <i className={activeCount ? "active" : ""}/>
            {activeCount} ACTIVE
          </div>
        </div>

        <div className="sp-graphics-toggles">
          <button className={graphics.live ? "active" : ""} onClick={() => toggle("live")}>
            <Radio size={15}/> LIVE BUG
          </button>
          <button className={graphics.lowerThird ? "active" : ""} onClick={() => toggle("lowerThird")}>
            <BadgeInfo size={15}/> LOWER THIRD
          </button>
          <button className={graphics.ticker ? "active" : ""} onClick={() => toggle("ticker")}>
            <ScrollText size={15}/> TICKER
          </button>
          <button className={graphics.countdown ? "active" : ""} onClick={() => toggle("countdown")}>
            <Clock3 size={15}/> COUNTDOWN
          </button>
          <button className={graphics.topic ? "active" : ""} onClick={() => toggle("topic")}>
            <ImagePlus size={15}/> TOPIC IMAGE
          </button>
          <button className={graphics.logo ? "active" : ""} onClick={() => toggle("logo")}>
            <Layers3 size={15}/> LOGO BUG
          </button>
        </div>

        <div className="sp-graphics-grid">
          <div className="sp-graphics-card">
            <span className="panel-label">LOWER THIRD</span>
            <label>
              KICKER
              <input value={graphics.headline} onChange={e => setValue("headline", e.target.value)} />
            </label>
            <label>
              HEADLINE / DESCRIPTION
              <input value={graphics.subheadline} onChange={e => setValue("subheadline", e.target.value)} />
            </label>
            <button className="sp-take" onClick={() => setValue("lowerThird", true)}>
              TAKE LOWER THIRD
            </button>
          </div>

          <div className="sp-graphics-card">
            <span className="panel-label">NEWS TICKER / CRAWL</span>
            <label>
              SCROLLING TEXT
              <textarea rows="3" value={graphics.tickerText} onChange={e => setValue("tickerText", e.target.value)} />
            </label>
            <button className="sp-take" onClick={() => setValue("ticker", true)}>
              TAKE TICKER
            </button>
          </div>

          <div className="sp-graphics-card">
            <span className="panel-label">COUNTDOWN BUG</span>
            <label>
              LABEL
              <input value={graphics.countdownLabel} onChange={e => setValue("countdownLabel", e.target.value)} />
            </label>
            <label>
              MINUTES
              <input
                type="number"
                min="0"
                max="999"
                value={graphics.countdownMinutes}
                onChange={e => setValue("countdownMinutes", e.target.value)}
              />
            </label>
            <div className="sp-countdown-actions">
              <button onClick={startCountdown}>{counting ? "RUNNING" : "START"}</button>
              <button onClick={() => setCounting(false)}>PAUSE</button>
              <button onClick={resetCountdown}><RotateCcw size={13}/> RESET</button>
            </div>
          </div>

          <div className="sp-graphics-card">
            <span className="panel-label">TOPIC / OVER-THE-SHOULDER</span>
            <label className="sp-file-button">
              <Upload size={14}/> UPLOAD TOPIC IMAGE
              <input type="file" accept="image/*" onChange={e => loadImage(e, "topic")} />
            </label>
            <div className="sp-side-actions">
              <button className={graphics.topicSide === "left" ? "active" : ""} onClick={() => setValue("topicSide", "left")}>LEFT</button>
              <button className={graphics.topicSide === "right" ? "active" : ""} onClick={() => setValue("topicSide", "right")}>RIGHT</button>
              <button onClick={() => setValue("topic", false)}><X size={13}/> CLEAR</button>
            </div>
          </div>

          <div className="sp-graphics-card">
            <span className="panel-label">CORNER LOGO / BUG</span>
            <label>
              FALLBACK TEXT
              <input maxLength="8" value={graphics.logoText} onChange={e => setValue("logoText", e.target.value)} />
            </label>
            <label className="sp-file-button">
              <Upload size={14}/> UPLOAD LOGO
              <input type="file" accept="image/*" onChange={e => loadImage(e, "logo")} />
            </label>
          </div>

          <div className="sp-graphics-card sp-graphics-master">
            <span className="panel-label">DIRECTOR TAKE CONTROLS</span>
            <strong>Program overlay stack</strong>
            <small>Prepare graphics here, then take each layer on-air independently.</small>
            <button className="sp-clear-all" onClick={() => setGraphics(current => ({
              ...current,
              live: false,
              lowerThird: false,
              ticker: false,
              countdown: false,
              topic: false,
              logo: false
            }))}>
              CLEAR ALL GRAPHICS
            </button>
            <button className="sp-restore" onClick={() => {
              setGraphics(INITIAL);
              setRemaining(INITIAL.countdownMinutes * 60);
              setCounting(false);
            }}>
              <Save size={13}/> RESET DEFAULT PACKAGE
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
