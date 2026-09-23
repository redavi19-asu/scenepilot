import { useCallback, useState } from "react";
import { LockKeyhole, LogIn, Mail } from "lucide-react";
import TurnstileWidget from "./TurnstileWidget.jsx";
import { apiFetch, setNativeSessionToken } from "./runtimeApi";

async function api(path, options = {}) {
  const response = await apiFetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const rawText = await response.text();
  let data = {};
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = { error: `Urban Director Studio account service failed (HTTP ${response.status}).` };
  }

  if (!response.ok) {
    throw new Error(data?.error || "Request failed.");
  }
  if (data?.sessionToken) setNativeSessionToken(data.sessionToken);
  return data;
}

function go(path) {
  window.location.assign(path);
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  const onToken = useCallback(token => {
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
      const data = await api("/api/auth/password/request", {
        method: "POST",
        body: JSON.stringify({ email, turnstileToken })
      });
      setStatus(
        data.message ||
        "If an ICA Software account exists for that email, a password reset link has been sent."
      );
      setTurnstileToken("");
      setTurnstileResetKey(value => value + 1);
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
      <button className="sp-auth-back" type="button" onClick={() => go("/login")}>
        ← Back to login
      </button>
      <div className="sp-auth-card">
        <div className="sp-auth-logo"><Mail size={26}/></div>
        <span className="sp-kicker">ICA SOFTWARE ACCOUNT</span>
        <h1>Reset your password.</h1>
        <p>
          Enter the email on your ICA Software account. We&apos;ll send a secure
          one-time link that expires in 30 minutes.
        </p>

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

          <TurnstileWidget
            action="password_reset"
            onToken={onToken}
            onError={message => setStatus(message || "Security check could not be completed.")}
            resetKey={turnstileResetKey}
          />

          {status && <div className="sp-auth-error" role="status">{status}</div>}

          <button className="sp-auth-submit" disabled={busy || !turnstileToken}>
            <Mail size={17}/>
            {busy ? "SENDING..." : "SEND RESET LINK"}
          </button>
        </form>
      </div>
    </div>
  );
}

export function ResetPasswordPage() {
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setStatus("");

    if (!token) {
      setStatus("This password reset link is missing its security token.");
      return;
    }
    if (password.length < 10) {
      setStatus("Use at least 10 characters for the new password.");
      return;
    }
    if (password !== confirmPassword) {
      setStatus("The two passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const data = await api("/api/auth/password/reset", {
        method: "POST",
        body: JSON.stringify({ token, password })
      });
      setComplete(true);
      setPassword("");
      setConfirmPassword("");
      setStatus(data.message || "Password updated. You can sign in now.");
      window.history.replaceState({}, "", "/reset-password");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sp-auth-shell">
      <button className="sp-auth-back" type="button" onClick={() => go("/login")}>
        ← Back to login
      </button>
      <div className="sp-auth-card">
        <div className="sp-auth-logo"><LockKeyhole size={26}/></div>
        <span className="sp-kicker">ICA SOFTWARE ACCOUNT</span>
        <h1>{complete ? "Password updated." : "Choose a new password."}</h1>
        <p>
          {complete
            ? "Your password has been changed and existing ICA sessions were closed."
            : "This updates the password on your shared ICA Software account."}
        </p>

        {!complete ? (
          <form onSubmit={submit}>
            <label>
              NEW PASSWORD
              <input
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                autoComplete="new-password"
                minLength={10}
                required
              />
            </label>
            <label>
              CONFIRM NEW PASSWORD
              <input
                type="password"
                value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={10}
                required
              />
            </label>
            {status && <div className="sp-auth-error" role="status">{status}</div>}
            <button className="sp-auth-submit" disabled={busy}>
              <LockKeyhole size={17}/>
              {busy ? "UPDATING..." : "UPDATE PASSWORD"}
            </button>
          </form>
        ) : (
          <>
            {status && <div className="sp-auth-error" role="status">{status}</div>}
            <button className="sp-auth-submit" type="button" onClick={() => go("/login")}>
              <LogIn size={17}/> RETURN TO LOGIN
            </button>
          </>
        )}
      </div>
    </div>
  );
}
