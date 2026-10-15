# Google Play internal testing

The signed Android workflow creates a private AAB and APK artifact. It does not publish to Google Play. The AAB belongs in Play Console's Internal testing track; invited testers install through the track's opt-in link, similar to TestFlight.

## Remaining account setup

1. Confirm whether the existing Google account already owns a Play Console developer account and this package: `com.icomputeranything.scenepilot`. Do not create a duplicate listing or replace an existing signing key without checking it.
2. If the listing exists, compare its upload certificate with the protected local upload-key backup. Use a higher version code than any previously uploaded build. The workflow's manual `build_number` input supports that.
3. Create the subscription `director_pro_monthly`, with auto-renewing base plan `monthly`. Confirm the intended $39.99 monthly US price and applicable regions in Console. The app displays Google's localized price once connected.
4. Grant a dedicated Google service account the necessary purchase verification and subscription-management access to this app. Store its JSON as the Cloudflare secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, never in the repository. Existing `BROADCAST_CONFIG_KEY` protects stored purchase tokens.
5. Enable the backend variable `GOOGLE_PLAY_BILLING_ENABLED=true` only when the Console product, API access and test track are ready. Without it, purchase controls stay disabled. Check `/api/billing/google/config`.
6. Upload the signed AAB to Internal testing and configure license testers. Test a successful purchase, cancellation, pending purchase, restore, renewal, expired access, refund/revocation and a second Director account before considering production. Device tests remain required; mocked server tests do not establish that Google accepted a real purchase.

Server verification checks the package, product, base plan, expiry and account binding before granting access. Acknowledgment happens on the server. Scheduled verification refreshes recent subscriptions every five minutes, and restoration also refreshes them. This is polling, so state changes are not instantaneous; real-time developer notifications can be added later. Existing active Apple subscriptions are preserved.

## Release checks

The workflow validates web assets, builds both signed package formats and verifies their signatures. Artifacts are private and expire after 14 days; keep release copies in a protected location. The newly generated upload key is a candidate until any existing Play listing's certificate is checked. Google account registration, identity checks, Console declarations, screenshots and store approval are not completed by a successful package build.
