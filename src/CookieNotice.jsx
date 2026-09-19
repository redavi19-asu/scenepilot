import { useEffect, useState } from "react";

const STORAGE_KEY = "urban-director-cookie-notice-dismissed";

export default function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(STORAGE_KEY) !== "1");
    } catch {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {}
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <aside className="uds-cookie-notice" aria-label="Cookie notice">
      <div>
        <strong>Cookies</strong>
        <span>Urban Director Studio uses essential cookies and browser storage for secure account access, production settings, and session continuity.</span>
      </div>
      <button type="button" onClick={dismiss} aria-label="Dismiss cookie notice">OK</button>
    </aside>
  );
}
