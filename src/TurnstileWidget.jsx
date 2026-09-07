import { useEffect, useRef } from "react";

const DEFAULT_SITE_KEY = "0x4AAAAAAEpl_r2LJcL18Dn5";
const SCRIPT_ID = "scenepilot-turnstile-script";

export default function TurnstileWidget({
  action = "login",
  onToken,
  resetKey = 0
}) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const siteKey =
    import.meta.env.VITE_TURNSTILE_SITE_KEY ||
    DEFAULT_SITE_KEY;

  useEffect(() => {
    let cancelled = false;

    const renderWidget = () => {
      if (
        cancelled ||
        !containerRef.current ||
        !window.turnstile
      ) {
        return;
      }

      if (widgetIdRef.current !== null) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch (_) {}
        widgetIdRef.current = null;
      }

      widgetIdRef.current = window.turnstile.render(
        containerRef.current,
        {
          sitekey: siteKey,
          theme: "dark",
          action,
          callback: token => onToken(token),
          "expired-callback": () => onToken(""),
          "error-callback": () => onToken("")
        }
      );
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      let script = document.getElementById(SCRIPT_ID);

      if (!script) {
        script = document.createElement("script");
        script.id = SCRIPT_ID;
        script.src =
          "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }

      script.addEventListener("load", renderWidget, {
        once: true
      });
    }

    return () => {
      cancelled = true;

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
  }, [action, onToken, resetKey, siteKey]);

  return (
    <div className="sp-turnstile-wrap">
      <div ref={containerRef}/>
      <small>
        Protected by Cloudflare Turnstile
      </small>
    </div>
  );
}
