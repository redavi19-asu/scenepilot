# Required subscription and Apple delivery verification

Urban Director Studio is free to download. An ordinary customer needs one active subscription to use camera and Director tools. `pro` and `com.icomputeranything.scenepilot.pro.monthly` remain internal plan/product identifiers; this change does not create another product or change the $39.99 monthly price. Owner/admin access and existing explicitly granted review/complimentary access remain intact.

## Behavior

- iOS returns verified StoreKit transactions without finishing them. JavaScript verifies and applies the transaction through `/api/billing/apple/sync`, then acknowledges it through `finishTransaction`.
- Failed verification leaves the transaction unfinished. StoreKit updates, launch recovery, foreground reconciliation and Restore retry delivery. Simultaneous purchase/update deliveries share verification.
- The purchase button is unavailable until Apple loads the product and is not offered to owners or accounts with active access.
- Camera links require sign-in and an active entitlement. A paid camera receives a short-lived network ticket after validating the room invite. Tickets never grant Director privileges without network membership. Signaling rechecks entitlement expiry. TURN issuance requires an entitled account and membership or a scoped camera invite.
- Public pricing and billing use the app name without suggesting a free/Pro tier.

## Rollout dependency

Do not deploy the camera subscription gate independently of compatible native clients. Public iOS 1.0 predates camera tickets; submitted Mac build 36 loads the current first-party web assets. The current Mac review notes also describe the former free camera model. Coordinate compatible iOS and Mac releases and update review metadata before enforcing this gate against existing native installations. Do not cancel an active Apple review merely to deploy this branch.

The production Apple subscription still needs approval. Code checks do not certify production charges. The production backend currently accepts sandbox transactions in the same entitlement table. Use a dedicated test account and explicitly reviewed isolation before device payment testing; do not use owner/reviewer access to claim purchase activation.

## Checks

Local validation on November 12, 2026: 139 Apple, entitlement, Worker and Electron tests passed; web build and release invariants passed. Lint completed with existing unrelated warnings. iOS compilation requires Xcode; this Mac has only command-line tools, so the archive workflow is used for compilation.

## Device acceptance

1. Install the corrected signed test build with a working compatible backend; confirm the environment and build number.
2. Sign in with a dedicated ordinary account that has no entitlement. Verify Director and invited-camera routes require subscription before asking for camera/microphone access.
3. Confirm the U.S. monthly product and sandbox purchase sheet. Cancel: access stays blocked.
4. Complete a no-charge sandbox purchase. Record anonymized transaction ID, environment, backend entitlement expiry, and access before/after. Confirm the app unlocks without a second charge.
5. Interrupt networking after Apple success; confirm the transaction stays unfinished and Restore/relaunch/foreground can recover access.
6. Verify delayed approval while open and after relaunch. Verify restore/reinstall and same-account access across devices, renewal, auto-renew cancellation, expiration and resubscription.
7. Confirm expired/unpaid users cannot connect using an old camera ticket; paid camera tickets still cannot control another network.
8. Preserve owner access and reject attempts to bind the same Apple subscription to a different app account.

## Isolated signed test build

The iOS archive workflow has an explicit `billing_qc` input (default false). With it enabled, the workflow validates and deploys only `director-billing-sandbox`, restricted to D1 `ea8a6e9a-bb4e-4963-b393-a0b68d618be0`, installs Apple verification secrets without logging their values, checks backend health, then builds native assets pointed at that backend. The sandbox verifies Apple Sandbox transactions only. Production defaults and routing are unchanged.

The test app displays a persistent payment-test banner and stores its app session separately from the normal app. An explicit build-time allowlist rejects arbitrary native API origins. The test build uses the existing bundle/product ID so StoreKit can resolve the real subscription in Apple's sandbox; it replaces the prior installed test app rather than being a second public product. Do not submit this QC build as the public release.

The test backend does not carry production streaming or AI credentials. Successful payment activation verifies subscription access, not full broadcast readiness. Sandbox server notifications are not configured for this backend yet; notification delivery and lifecycle tests remain separate acceptance items.

## November 12 production submission

Fresh Apple Sandbox purchase, unlock, full relaunch, manual restore and the first accelerated renewal passed on physical iPhone build 44 against the isolated backend. Build 45 uses the production origin and includes the later recovery-error display fix. No real production charge has been claimed.

Mac 1.0.0 (36), its subscription and subscription group remain In Review, with no newer Apple message requesting another binary. Build 36 loads the first-party web application, including updated camera tickets after deployment; its native StoreKit adapter already verifies before finishing. Preserve this submission.

Production temporarily sets `ALLOW_LEGACY_CAMERA_INVITES=true` to preserve old iOS 1.0 (42) invitation connections while Apple reviews 1.0.1. This preserves only valid camera invitations, never Director access or paid camera ticket issuance. Updated clients require payment. Remove the explicit production bridge once the compatible release is available. All other environments deny unpaid camera connections by default.
