# macOS 1.0.0 App Review response — November 9, 2026

## Response to Apple

Thank you for your review. Please find the requested clarifications below.

**Network server entitlement**

Urban Director Studio uses `com.apple.security.network.server` for the desktop application's browser sign-in callback. When the user selects **Continue in browser** on the sign-in screen, the installed Mac app starts a temporary HTTP listener bound only to `127.0.0.1` on an operating-system-assigned port. After browser authentication, the browser returns a single-use authorization code and state to `http://127.0.0.1:<port>/callback`. The app validates the callback and exchanges the code using PKCE, then stores the session in its secure, HTTP-only cookie store.

This is an incoming connection from the browser to the installed application, so the outgoing network client entitlement alone does not cover this feature. The callback listener is not bound to a LAN or public interface. It closes after successful sign-in, cancellation, an exchange failure, or the five-minute timeout.

To exercise this feature:

1. Open the installed macOS app. If already signed in, sign out to reach the sign-in screen.
2. Select **Continue in browser**.
3. Complete sign-in in the browser using the review account supplied in App Review Information.
4. The browser returns to the app's local callback and displays “Signed in. You can return to Urban Director Studio.” The app proceeds to the Director console.

**Subscription price confirmation**

We confirm that **Urban Director Studio Pro Monthly**, product ID `com.icomputeranything.scenepilot.pro.monthly`, is intentionally priced at **$39.99 USD per month** in the US storefront. Other storefronts display the localized App Store price.

Please continue the review. Thank you.

## App Review Information note

The macOS app requires the network server entitlement for **Continue in browser** sign-in. This creates a temporary loopback-only listener at `127.0.0.1` on a random available port to receive the browser's single-use, state-validated, PKCE-protected authentication callback. It does not expose a public or LAN server. Select **Continue in browser**, authenticate with the supplied review account, and return to the Director console. The intended US subscription price for Urban Director Studio Pro Monthly is $39.99 USD per month.

## Verification and submission status

- Implementation: `electron/desktopAuth.cjs`; main-process registration: `electron/main.cjs`; visible trigger: `src/ScenePilotPortal.jsx`.
- Existing desktop auth tests exercise callback success, incorrect state rejection, PKCE challenge, cancellation/listener closure, concurrent sign-in rejection, and failed exchange handling.
- The entitlement is retained because the callback listener needs it. No runtime permission expansion or pricing change is made.
- Before posting, confirm the selected App Store build contains this sign-in flow; repository source alone cannot prove which binary Apple selected.
- Paste the response into the existing App Review conversation and the note into App Review Information. No response has been sent by preparing this file.
- A fresh macOS sandbox/device acceptance test and App Store Connect posting are not completed in this Linux session.
