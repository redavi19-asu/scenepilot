# Branded Studio sign-in

Ryan approved `https://urbandirector.icomputeranything.com` on October 28, 2026. It is a custom domain for the existing scenepilot Worker and database; no domain was purchased. The existing workers.dev host remains available for installed apps and prior OAuth callbacks.

Google's existing ICA Central Web Login client now includes the exact callback `https://urbandirector.icomputeranything.com/api/auth/social/google/callback`, preserving all six previous callbacks. The Studio Turnstile widget accepts both Studio hostnames.

`SOCIAL_GOOGLE_PUBLIC_ORIGIN` redirects Google **start** requests from the legacy host to the branded host before creating OAuth state. The new host then generates its own PKCE request, callback and host-only session cookie. Existing callbacks continue resolving on their original host. Apple and Microsoft routing is unchanged because their new callbacks have not been registered. Native runtime API URLs remain compatible with installed binaries.

`scripts/configure-production-domain.mjs` and its existing workflow now target the approved subdomain inside the existing `icomputeranything.com` zone. They refuse to replace a hostname assigned to another Worker.

Google's project-wide consent brand remains **I Computer Anything**, shared with other ICA products. This change removes Studio's workers.dev callback from new Google sign-ins; it does not assert that Google has verified a separate Urban Director Studio brand. Google may display the parent domain `icomputeranything.com`.

Tests cover legacy start redirects, return destination validation, branded PKCE/callback generation and invalid configuration. Existing provider/role callback tests protect prior logins. Browser checks must separately verify Google's actual displayed destination; mocked tests do not prove a completed user login.
