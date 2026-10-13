# Urban Director Studio — Live Media Preflight

The Director and camera operators may use completely different internet providers, Wi-Fi networks or cellular networks. Director media and intercom use Cloudflare TURN as a relay fallback for restrictive networks; direct peer-to-peer media remains preferred when available.

## Required production secrets

Configure `DIRECTOR_TURN_KEY_ID` and `DIRECTOR_TURN_KEY_SECRET` as Cloudflare Worker secret bindings for `scenepilot`. Do not store the key in GitHub or browser code. The Worker issues short-lived ICE credentials only after authenticating the Director account or an unexpired room-bound camera invitation. A missing relay must produce an explicit media error; it must not silently claim a working remote connection.

## Before an event

1. Test Director on home Wi-Fi while a camera uses cellular data (not the same Wi-Fi). Verify moving video reaches Program and audio reaches the mixer.
2. Test walkie-talkie transmission in both directions on two separate internet providers and verify camera-audio muting.
3. Move the phone between cellular and Wi-Fi. Verify WebSocket reconnect, room rejoin, WebRTC renegotiation and Program recovery.
4. Run an independent viewer test and confirm Cloudflare Realtime video or automatic HLS backup.
5. Check real encoder /health, then broadcast to the intended destination. Check streamed audio and graphics, and capture a short test recording.
6. Check session timing: camera links have an eight-hour validity window; generate fresh invites at the event and avoid leaving unneeded browser tabs open for long periods.

CI passing is not a substitute for the real two-network hardware check. Do not describe weekend production as fully green until these checks pass.
