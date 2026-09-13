import { Capacitor } from "@capacitor/core";
import { useEffect, useRef } from "react";

const DEFAULT_SITE_KEY = "0x4AAAAAAErrAXJrlyLdjt5s";
const SCRIPT_ID = "scenepilot-turnstile-script";

export default function TurnstileWidget({
  action = "login",
  onToken,
  onError,
  resetKey = 0
}) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const siteKey =
    import.meta.env.VITE_TURNSTILE_SITE_KEY ||
    DEFAULT_SITE_KEY;

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      onToken("native-app");
      return () => onToken("");
    }

    let cancelled = false;
    let pollTimer = null;
    let attempts = 0;
    let script = document.getElementById(SCRIPT_ID);

    const reportError = message => {
      if (cancelled) return;
      onToken("");
      if (onError) onError(message);
    };

    const removeWidget = () => {
      if (
        widgetIdRef.current !== null &&
        window.turnstile
      ) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch (_) {}
      }

      widgetIdRef.current = null;
    };

    const renderWidget = () => {
      if (
        cancelled ||
        !containerRef.current ||
        !window.turnstile
      ) {
        return false;
      }

      removeWidget();

      try {
        widgetIdRef.current = window.turnstile.render(
          containerRef.current,
          {
            sitekey: siteKey,
            theme: "dark",
            action,
            appearance: "always",
            callback: token => {
              if (cancelled) return;
              onToken(token);
            },
            "expired-callback": () => onToken(""),
            "timeout-callback": () => {
              reportError("Security check timed out. Tap retry and try again.");
            },
            "error-callback": () => {
              reportError("Security check could not load. Tap retry and try again.");
            }
          }
        );
        return true;
      } catch (_) {
        reportError("Security check could not start. Tap retry and try again.");
        return false;
      }
    };

    const waitForTurnstile = () => {
      if (cancelled) return;

      if (renderWidget()) return;

      attempts += 1;
      if (attempts >= 80) {
        reportError("Security check is taking too long to load. Tap retry and try again.");
        return;
      }

      pollTimer = window.setTimeout(waitForTurnstile, 150);
    };

    const handleScriptError = () => {
      reportError("Security check could not be downloaded. Check your connection and tap retry.");
    };

    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    script.addEventListener("error", handleScriptError);
    waitForTurnstile();

    return () => {
      cancelled = true;
      if (pollTimer) window.clearTimeout(pollTimer);
      script?.removeEventListener("error", handleScriptError);
      removeWidget();
    };
  }, [action, onError, onToken, resetKey, siteKey]);

  if (Capacitor.isNativePlatform()) {
    return (
      <div className="sp-turnstile-wrap sp-native-auth-check">
        <small>Secure app sign-in</small>
      </div>
    );
  }

  return (
    <div className="sp-turnstile-wrap">
      <div ref={containerRef}/>
      <small>
        Protected by Cloudflare Turnstile
      </small>
    </div>
  );
}
