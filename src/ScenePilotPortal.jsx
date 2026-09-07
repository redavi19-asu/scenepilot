import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Radio, LogIn, UserPlus, Download, LockKeyhole, MessageSquare,
  Send, ShieldCheck, Users, ArrowRight, LogOut, Crown, Mail,
  X, Camera, RadioTower
} from "lucide-react";
import App from "./App.jsx";
import TurnstileWidget from "./TurnstileWidget.jsx";
import { socket } from "./socket";
import "./ScenePilotPortal.css";

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  let data = null;
  let rawText = "";

  try {
    rawText = await response.text();
    data = rawText ? JSON.parse(rawText) : {};
  } catch (_) {
    data = {
      error:
        response.ok
          ? "ScenePilot returned an unreadable response."
          : `ScenePilot account service failed (HTTP ${response.status}).`
    };
  }

  if (!response.ok) {
    const message = [
      data?.error || "Request failed.",
      data?.detail ? `Details: ${data.detail}` : ""
    ].filter(Boolean).join(" ");

    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

function go(path) {
  window.location.assign(path);
}

function LandingPage() {
  return (
    <div className="sp-landing">
      <header className="sp-landing-nav">
        <div className="sp-landing-brand">
          <span className="sp-landing-mark"><Radio size={24}/></span>
          <div>
            <strong>SCENEPILOT</strong>
            <small>BY I COMPUTER ANYTHING</small>
          </div>
        </div>

        <button className="sp-nav-login" onClick={() => go("/app")}>
          <LogIn size={17}/> LOGIN
        </button>
      </header>

      <main>
        <section className="sp-hero">
          <div className="sp-hero-copy">
            <span className="sp-kicker">LIVE PRODUCTION • PHONES • CAMERAS • EVENTS</span>
            <h1>Your production switcher can fit in a browser.</h1>
            <p>
              ScenePilot turns phones, tablets, capture devices and computers into a
              coordinated live-production system with a dedicated Director and wireless
              camera operators.
            </p>

            <div className="sp-hero-actions">
              <button className="sp-primary" onClick={() => go("/app")}>
                <LogIn size={18}/> LOGIN
              </button>
              <button className="sp-secondary" disabled title="Desktop download will unlock after release packaging is complete.">
                <Download size={18}/> DOWNLOAD — COMING SOON
              </button>
            </div>

            <div className="sp-beta-note">
              <ShieldCheck size={17}/>
              <span>Private beta access is currently invite-only.</span>
            </div>
          </div>

          <div className="sp-hero-console">
            <div className="sp-console-top">
              <span><i/> DIRECTOR ONLINE</span>
              <span>ROOM SP-4827</span>
            </div>
            <div className="sp-console-screens">
              <div><Camera size={34}/><strong>PREVIEW</strong><small>CAM 07</small></div>
              <div><RadioTower size={34}/><strong>PROGRAM</strong><small>LIVE</small></div>
            </div>
            <div className="sp-console-cams">
              {[1,2,3,4,5,6].map(cam => <span key={cam}>CAM {String(cam).padStart(2,"0")}</span>)}
            </div>
          </div>
        </section>

        <section className="sp-feature-strip">
          <article>
            <Users size={22}/>
            <strong>ONE DIRECTOR</strong>
            <p>One authorized Director controls the room. QR-code users join as camera operators only.</p>
          </article>
          <article>
            <MessageSquare size={22}/>
            <strong>OPERATOR COMMS</strong>
            <p>Camera operators can text the Director when a loud venue makes voice communication difficult.</p>
          </article>
          <article>
            <LockKeyhole size={22}/>
            <strong>ICA ACCOUNT</strong>
            <p>Your login is designed to become one account for ScenePilot and future I Computer Anything SaaS products.</p>
          </article>
        </section>

        <section className="sp-plans">
          <div>
            <span className="sp-kicker">EARLY ACCESS</span>
            <h2>Get the account system in place now. Billing comes next.</h2>
            <p>
              Stripe purchasing and desktop downloads are intentionally disabled until
              the commercial release flow is connected.
            </p>
          </div>
          <button className="sp-disabled-pay" disabled>
            STRIPE CHECKOUT — COMING SOON
          </button>
        </section>
      </main>

      <footer className="sp-landing-footer">
        <span>ScenePilot</span>
        <span>Built by I Computer Anything</span>
      </footer>
    </div>
  );
}

function AuthPanel({ onAuthenticated }) {
  const mode = "login";
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [marketing, setMarketing] = useState(true);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  const handleTurnstileToken = useCallback(token => {
    setTurnstileToken(token || "");
    if (token) setStatus("");
  }, []);

  async function submit(event) {
    event.preventDefault();
    setStatus("");

    if (!turnstileToken) {
      setStatus("Complete the Cloudflare security check before continuing.");
      return;
    }

    setBusy(true);

    try {
      const payload = mode === "register"
        ? {
            displayName,
            email,
            password,
            marketingOptIn: marketing,
            turnstileToken
          }
        : {
            email,
            password,
            turnstileToken
          };

      const data = await api(
        mode === "register" ? "/api/auth/register" : "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify(payload)
        }
      );

      onAuthenticated(data.user);
    } catch (error) {
      setStatus(error.message);
      setTurnstileToken("");
      setTurnstileResetKey(value => value + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sp-auth-shell">
      <button className="sp-auth-back" onClick={() => go("/")}>← ScenePilot home</button>
      <div className="sp-auth-card">
        <div className="sp-auth-logo"><Radio size={26}/></div>
        <span className="sp-kicker">ICA SOFTWARE ACCOUNT</span>
        <h1>Welcome back.</h1>
        <p>Sign in to open the Director console. New accounts are currently invite-only.</p>

        <form onSubmit={submit}>
          <label>
            EMAIL
            <input
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label>
            PASSWORD
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoComplete="current-password"
              minLength={8}
              required
            />
          </label>

          <TurnstileWidget
            action="login"
            onToken={handleTurnstileToken}
            resetKey={turnstileResetKey}
          />

          {status && <div className="sp-auth-error">{status}</div>}

          <button className="sp-auth-submit" disabled={busy || !turnstileToken}>
            <LogIn size={17}/>
            {busy ? "PLEASE WAIT..." : "LOGIN"}
          </button>
        </form>
      </div>
    </div>
  );
}

function AccountBar({ user, onLogout }) {
  return (
    <div className="sp-account-bar">
      <div>
        {user.role === "owner" ? <Crown size={15}/> : <ShieldCheck size={15}/>}
        <span>{user.displayName || user.email}</span>
        <small>{String(user.plan || "beta").toUpperCase()}</small>
      </div>
      {(user.role === "owner" || user.role === "admin") && (
        <button onClick={() => go("/admin")}>ADMIN</button>
      )}
      <button onClick={onLogout}><LogOut size={14}/> LOGOUT</button>
    </div>
  );
}

function CommsPanel({ mode }) {
  const roomCode = new URLSearchParams(window.location.search).get("room") || "SP-4827";
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [targets, setTargets] = useState([]);
  const [targetId, setTargetId] = useState("");
  const [draft, setDraft] = useState("");
  const [unread, setUnread] = useState(0);
  const [incomingAlert, setIncomingAlert] = useState(null);
  const [cameraNames, setCameraNames] = useState(() => {
    try {
      return JSON.parse(
        window.localStorage.getItem(`scenepilot:cameraNames:${roomCode}`) || "{}"
      );
    } catch (_) {
      return {};
    }
  });

  useEffect(() => {
    if (!incomingAlert) return;

    const timer = window.setTimeout(() => {
      setIncomingAlert(null);
    }, 6500);

    return () => window.clearTimeout(timer);
  }, [incomingAlert]);

  useEffect(() => {
    const handleCameraNames = event => {
      if (event.detail?.roomCode !== roomCode) return;
      setCameraNames(event.detail?.names || {});
    };

    window.addEventListener("scenepilot:camera-names", handleCameraNames);
    return () => {
      window.removeEventListener("scenepilot:camera-names", handleCameraNames);
    };
  }, [roomCode]);

  const displayCameraName = camera =>
    cameraNames[String(camera?.slotId)] ||
    cameraNames[camera?.slotId] ||
    camera?.name ||
    "CAMERA";

  useEffect(() => {
    const handleMessage = message => {
      setMessages(current => [...current.slice(-49), message]);

      if (!open) {
        setUnread(value => value + 1);
      }

      if (mode === "camera" && message.fromRole === "director") {
        setIncomingAlert(message);
      }
    };

    const handleCameras = cameras => {
      setTargets(cameras || []);
      setTargetId(current => {
        if (current && (cameras || []).some(camera => camera.socketId === current)) {
          return current;
        }
        return cameras?.[0]?.socketId || "";
      });
    };

    const handleJoined = camera => {
      setTargets(current => {
        const rest = current.filter(item => item.socketId !== camera.socketId);
        return [...rest, camera];
      });
      setTargetId(current => current || camera.socketId);
    };

    const handleLeft = ({ socketId }) => {
      setTargets(current => current.filter(camera => camera.socketId !== socketId));
      setTargetId(current => current === socketId ? "" : current);
    };

    socket.on("chat:message", handleMessage);
    socket.on("room:cameras", handleCameras);
    socket.on("camera:joined", handleJoined);
    socket.on("camera:left", handleLeft);

    return () => {
      socket.off("chat:message", handleMessage);
      socket.off("room:cameras", handleCameras);
      socket.off("camera:joined", handleJoined);
      socket.off("camera:left", handleLeft);
    };
  }, [open]);

  const visibleMessages = useMemo(() => {
    if (mode !== "director" || !targetId) return messages;
    return messages.filter(message =>
      !message.cameraId ||
      message.cameraId === targetId ||
      message.target === "all"
    );
  }, [messages, mode, targetId]);

  function openPanel() {
    setOpen(true);
    setUnread(0);
  }

  function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !socket.connected) return;

    socket.emit("chat:send", {
      room: roomCode,
      text,
      target: mode === "director" ? (targetId || null) : null
    });

    setDraft("");
  }

  return (
    <>
      {mode === "camera" && incomingAlert && (
        <button
          className="sp-comms-alert"
          type="button"
          onClick={() => {
            setIncomingAlert(null);
            openPanel();
          }}
        >
          <span className="sp-comms-alert-label">DIRECTOR MESSAGE</span>
          <strong>{incomingAlert.text}</strong>
          <small>TAP TO OPEN COMMS</small>
        </button>
      )}

      <button className={`sp-comms-fab ${mode}`} onClick={openPanel}>
        <MessageSquare size={18}/>
        {mode === "camera" ? "MESSAGE DIRECTOR" : "CAMERA COMMS"}
        {unread > 0 && <b>{unread > 9 ? "9+" : unread}</b>}
      </button>

      {open && (
        <div className="sp-comms-backdrop" onClick={() => setOpen(false)}>
          <section className={`sp-comms-panel ${mode}`} onClick={event => event.stopPropagation()}>
            <header>
              <div>
                <span className="sp-kicker">{mode === "camera" ? "DIRECTOR LINK" : "PRODUCTION COMMS"}</span>
                <strong>{mode === "camera" ? "Message the Director" : "Camera Operator Messages"}</strong>
              </div>
              <button onClick={() => setOpen(false)}><X size={18}/></button>
            </header>

            {mode === "director" && (
              <label className="sp-comms-target">
                SEND TO
                <select value={targetId} onChange={event => setTargetId(event.target.value)}>
                  <option value="">ALL CAMERAS</option>
                  {targets.map(camera => (
                    <option key={camera.socketId} value={camera.socketId}>
                      CAM {String(camera.slotId || "?").padStart(2,"0")} — {displayCameraName(camera)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="sp-comms-thread">
              {!visibleMessages.length && (
                <div className="sp-comms-empty">
                  <MessageSquare size={28}/>
                  <span>No messages yet.</span>
                </div>
              )}

              {visibleMessages.map(message => (
                <article
                  key={message.id}
                  className={message.fromRole === mode ? "mine" : ""}
                >
                  <small>
                    {message.fromRole === "director"
                      ? "DIRECTOR"
                      : cameraNames[String(message.slotId)] || message.fromName || `CAM ${String(message.slotId || "?").padStart(2,"0")}`}
                  </small>
                  <p>{message.text}</p>
                  <time>{new Date(message.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
                </article>
              ))}
            </div>

            <form onSubmit={sendMessage}>
              <input
                value={draft}
                onChange={event => setDraft(event.target.value)}
                placeholder={
                  socket.connected
                    ? "Type a production message..."
                    : "Connect to the production first..."
                }
                maxLength={500}
                disabled={!socket.connected}
              />
              <button disabled={!draft.trim() || !socket.connected}><Send size={17}/></button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

function AdminPage({ user, onLogout }) {
  const [users, setUsers] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [status, setStatus] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");

  async function load() {
    try {
      const [userData, campaignData] = await Promise.all([
        api("/api/admin/users"),
        api("/api/admin/campaigns")
      ]);
      setUsers(userData.users || []);
      setCampaigns(campaignData.campaigns || []);
    } catch (error) {
      setStatus(error.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function updateAccess(targetUser, field, value) {
    try {
      await api(`/api/admin/users/${targetUser.id}/access`, {
        method: "POST",
        body: JSON.stringify({
          plan: field === "plan" ? value : targetUser.plan,
          accessStatus: field === "accessStatus" ? value : targetUser.accessStatus,
          role: field === "role" ? value : targetUser.role
        })
      });
      await load();
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function saveCampaign(event) {
    event.preventDefault();
    try {
      await api("/api/admin/campaigns", {
        method: "POST",
        body: JSON.stringify({ subject, bodyText })
      });
      setSubject("");
      setBodyText("");
      setStatus("Campaign draft saved. Delivery service will connect in the email phase.");
      await load();
    } catch (error) {
      setStatus(error.message);
    }
  }

  return (
    <div className="sp-admin">
      <header>
        <div>
          <span className="sp-kicker">I COMPUTER ANYTHING • SOFTWARE ADMIN</span>
          <h1>ScenePilot Accounts</h1>
        </div>
        <div className="sp-admin-actions">
          <button onClick={() => go("/app")}>OPEN SCENEPILOT</button>
          <button onClick={() => window.location.assign("https://icomputeranything.com/master")}>ICA MASTER</button>
          <button onClick={onLogout}><LogOut size={15}/> LOGOUT</button>
        </div>
      </header>

      {status && <div className="sp-admin-status">{status}</div>}

      <section className="sp-admin-summary">
        <article><Users size={20}/><strong>{users.length}</strong><span>ACCOUNTS</span></article>
        <article><Mail size={20}/><strong>{users.filter(item => item.marketingOptIn).length}</strong><span>UPDATE OPT-INS</span></article>
        <article><Crown size={20}/><strong>{users.filter(item => item.plan === "pro").length}</strong><span>PRO</span></article>
      </section>

      <section className="sp-admin-card">
        <div className="sp-admin-card-head">
          <div>
            <span className="sp-kicker">CUSTOMERS / BETA USERS</span>
            <h2>Account access</h2>
          </div>
        </div>

        <div className="sp-user-table-wrap">
          <table className="sp-user-table">
            <thead>
              <tr>
                <th>USER</th>
                <th>ROLE</th>
                <th>PLAN</th>
                <th>ACCESS</th>
                <th>UPDATES</th>
              </tr>
            </thead>
            <tbody>
              {users.map(item => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.displayName || "—"}</strong>
                    <small>{item.email}</small>
                  </td>
                  <td>
                    <select
                      value={item.role}
                      disabled={item.id === user.id}
                      onChange={event => updateAccess(item, "role", event.target.value)}
                    >
                      <option value="user">USER</option>
                      <option value="admin">ADMIN</option>
                    </select>
                  </td>
                  <td>
                    <select value={item.plan} onChange={event => updateAccess(item, "plan", event.target.value)}>
                      <option value="beta">BETA</option>
                      <option value="free">FREE</option>
                      <option value="ambassador">AMBASSADOR</option>
                      <option value="pro">PRO</option>
                    </select>
                  </td>
                  <td>
                    <select value={item.accessStatus} onChange={event => updateAccess(item, "accessStatus", event.target.value)}>
                      <option value="active">ACTIVE</option>
                      <option value="suspended">SUSPENDED</option>
                    </select>
                  </td>
                  <td>{item.marketingOptIn ? "YES" : "NO"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sp-admin-card sp-campaign-card">
        <div>
          <span className="sp-kicker">PRODUCT UPDATES</span>
          <h2>Email campaign drafts</h2>
          <p>
            Build the update here now. Actual bulk delivery will be connected to an email provider
            before this can send to customers.
          </p>
        </div>

        <form onSubmit={saveCampaign}>
          <input value={subject} onChange={event => setSubject(event.target.value)} placeholder="Campaign subject" required/>
          <textarea value={bodyText} onChange={event => setBodyText(event.target.value)} placeholder="Write the product update..." rows={7} required/>
          <button><Mail size={16}/> SAVE CAMPAIGN DRAFT</button>
        </form>

        <div className="sp-campaign-list">
          {campaigns.map(campaign => (
            <article key={campaign.id}>
              <strong>{campaign.subject}</strong>
              <span>{campaign.status.toUpperCase()} • {new Date(campaign.createdAt).toLocaleDateString()}</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function ScenePilotPortal() {
  const params = new URLSearchParams(window.location.search);
  const cameraMode = params.get("camera") === "1";
  const cleanPath = window.location.pathname.replace(/\/+$/, "") || "/";
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!cameraMode);

  useEffect(() => {
    if (cameraMode) return;

    api("/api/auth/me")
      .then(data => setUser(data.user || null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [cameraMode]);

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST", body: "{}" });
    } catch (_) {}
    setUser(null);
    go("/");
  }

  if (cameraMode) {
    return (
      <>
        <App/>
        <CommsPanel mode="camera"/>
      </>
    );
  }

  if (cleanPath === "/admin") {
    if (loading) return <div className="sp-portal-loading"><Radio size={28}/> LOADING ICA ACCOUNT...</div>;
    if (!user) return <AuthPanel onAuthenticated={setUser}/>;
    if (user.role !== "owner" && user.role !== "admin") {
      return (
        <div className="sp-auth-shell">
          <div className="sp-auth-card">
            <LockKeyhole size={28}/>
            <h1>Admin access required.</h1>
            <button className="sp-auth-submit" onClick={() => go("/app")}>RETURN TO SCENEPILOT</button>
          </div>
        </div>
      );
    }
    return <AdminPage user={user} onLogout={logout}/>;
  }

  if (cleanPath === "/app") {
    if (loading) return <div className="sp-portal-loading"><Radio size={28}/> LOADING ICA ACCOUNT...</div>;
    if (!user) return <AuthPanel onAuthenticated={setUser}/>;

    return (
      <>
        <App/>
        <AccountBar user={user} onLogout={logout}/>
        <CommsPanel mode="director"/>
      </>
    );
  }

  return <LandingPage/>;
}
