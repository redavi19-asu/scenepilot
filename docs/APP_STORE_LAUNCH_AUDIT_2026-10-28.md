# Urban Director Studio — Public App Store release QC
**Audit date:** 2026-10-28  
**Target:** first public iOS/iPadOS App Store release, version 1.0  
**Bundle:** `com.icomputeranything.scenepilot`  
**Latest shipped source:** `main` at `2121e68ccd17ac66c878fdd4ef12fa15fbd778e5`  
**Status:** Uploaded to App Store Connect, NOT VERIFIED SUBMITTED FOR PUBLIC APP REVIEW.

## Verified from GitHub
- [x] PR #27 merged to `main` with four original AI video templates, Featured Video tab, square logo bug, graphics default off, permission-gated screen/window share, clearly identified nine-cam demo stills, and in-app guide/manual.
- [x] CI workflow `40698366151` **success**: `npm ci`, production dependency audit, automated unit tests, lint, release invariants, web build, Capacitor iOS copy/privacy checks and Cloudflare deploy.
- [x] iOS Archive workflow `40698366168` **success**: Xcode build, provisioning/signing, .ipa export, Apple validation and `xcrun altool --upload-app`.
- [x] Apple StoreKit native plugin and subscription management/restore paths appear in source, as do cloud-side purchase verification handlers. A green build does NOT prove real purchase, server credentials, or renewal are functional.
- [x] Privacy manifest, camera/microphone use strings, support, privacy, terms, in-app delete-account control, reviewer-account instructions and App Store submission documentation are present in source.
- [x] Android internal CI workflow also exists, but this report covers iOS public release.
- [ ] Confirm Apple finished *processing* the uploaded build and that it is selectable for the public App Store version (needs App Store Connect).
- [ ] Verify latest app from TestFlight on physical devices (not confirmed by CI).

## What the code QC can and cannot prove
| Area | Code/automation finding | Remaining acceptance test |
| --- | --- | --- |
| iOS signing and upload | PASS: successful Actions upload step | Confirm processing and TestFlight install |
| Web/backend release | PASS: validated Cloudflare workflow | Login, HTTPS URLs and health from a real device |
| Multi-camera sources | Secure token / room scope checks and source routing in code | Two actual phones on separate Wi-Fi/cellular, reconnect and same/different room isolation |
| Preview / Program / TAKE | Distinct monitors and canvas compositor paths in code | Confirm all modes visibly switch and match recorded/streamed Program |
| Camera audio | Master audio controls exist | **Release risk:** compositor clones a primary source audio track only once at start. Switching the Program video later may not switch captured Program audio. Verify with two distinct microphones while recording/streaming; fix before claiming reliable production audio if reproduced |
| Screen/window capture | Uses `getDisplayMedia` after explicit button, checks browser support | **Platform-dependent:** WKWebView/iOS may not support it. Test desktop; don't advertise app-to-app iOS screen capture until verified |
| Graphic bug and overlays | Rendered square logo on DOM and canvas, graphics default off | Check actual broadcast/recording logo proportions/position, live bug separate, graphic OFF on initial load |
| Nine-cam demos | User-uploaded stills in offline slots are labeled DEMO STILL • NOT LIVE | Inspect source and 9-cam Program output for obvious/demo labeling and true live feed differentiation |
| Recording / replay | Recorder/compositor and replay paths present | 60-sec live recording, first/last 5 sec, storage, download, audio after TAKE, interrupted source, replay return |
| AI Studio | Four short prompt templates and server queue checks present | Verify provider credentials, pricing, 8-second results, consent, token failure/refund; don't use unlicensed audio/likeness |
| Tutorial | New 12-step tour and searchable manual present | Launch first-run welcome, replay via Menu → Tips / Help, iPhone/iPad accessibility/scroll/close |
| App subscriptions | StoreKit product `com.icomputeranything.scenepilot.pro.monthly`, Apple sync/refresh/restore handlers present | Sandbox purchase, renewal, expiration, restore across Apple IDs/devices, entitlement sync, $39.99 display |
| Accounts / review | Auth and account deletion workflow visible | New account/login/forgot password/fully delete; reviewer account sign-in from clean install |
| Stability / layouts | CI builds passed | Foreground/background, rotation, landscape, Wi-Fi to cellular, low-memory, iPhone/iPad tap targets |
| Legal/public pages | Routes present in source | Confirm support, privacy, terms URLs reachable without sign-in; external runtime not independently accessed by this audit |

## Device hands-on QC — required before submitting
Use a clean install of the latest TestFlight version. One device acts as Director; another as camera. Test twice: same network and mixed Wi-Fi/cellular.
- [ ] Sign up → sign in → log out → reset password → delete test account.
- [ ] Create room → invite second device with QR/link → allow camera/mic → see stable live feed → drop network → reconnect.
- [ ] Tap CAM 1 for Preview → TAKE into Program → CAM 2 Preview → TAKE; visually confirm camera output on Program.
- [ ] Record Program with two different mics while switching shots. Listen to the exported file and ensure audio follows the intended source/mix (not an old cloned audio track).
- [ ] Verify CUT, DISSOLVE, FADE; SINGLE, SPLIT, PiP and 9-CAM. Check labels and no wrong/blank source.
- [ ] Set all graphics OFF; turn on square LOGO and LIVE bug separately; record and inspect output.
- [ ] Load 3–4 demo stills into offline camera slots; ensure clear DEMO STILL labels before capturing product screenshots.
- [ ] Record 60 seconds, stop, wait for finalization, save/reopen; test replay and return to live.
- [ ] Run Help guide first-use, dismiss, search 'ingest', run the 12-stop button tour, verify on small iPhone and 13-inch iPad.
- [ ] Desktop Mac/Chrome: screen-share an authorized window, PREVIEW/TAKE/PiP, STOP SHARE. iOS: confirm graceful 'not supported' state if system API missing.
- [ ] iOS StoreKit Sandbox: purchase/restore, expiration/renewal, cancel/pending and new-device access.
- [ ] Confirm production streaming through actual receiver/viewer, with sound and graphics, not just local Preview.
- [ ] Review readable text, contrast, horizontal scroll, touch controls and portrait/landscape on both device sizes.

## Actual App Store screenshots (NOT concept/mockup images)
Apple currently requires **at least one iPhone Dynamic Island medium-display screenshot** and **one iPad 13-inch screenshot** for iPad apps (up to ten per display size). Consult current size specifications: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications . Captures must show actual installed app UI; screenshots in this list have NOT yet been captured or uploaded.
1. Director control room: CAMERA MULTIVIEW with realistic, rights-cleared original live sources; label any stills DEMO.
2. PREVIEW and PROGRAM side by side with source labels.
3. LIVE LAYOUT with PiP or split and secondary camera.
4. Add Camera: secure QR invitation/camera operator controls (redact actual invites and room codes).
5. Broadcast graphics: title, lower third, square Logo Bug, and LIVE Bug where appropriate.
6. MASTER AUDIO and record controls, ideally in the same real production.
7. In-app Guided Tour and searchable production manual.
8. AI Studio Featured Video templates only if service works in the review build and the copy identifies any additional paid tokens.

**Recommended order:** first screenshot should show the real Director console, not just a sign-in screen, logo or artificial promotional mockup. Remove personal account details, invite tokens, payment info and third-party copyrighted media.

## App Store listing text (reviewable draft)
**Name:** Urban Director Studio  
**Subtitle:** Multi-Camera Live Production  
**Category:** Photo & Video  
**Suggested promotional text:** Direct your live production with connected cameras, Preview and Program switching, audio, broadcast graphics, recording and in-app guidance.  
**Description:**

Urban Director Studio brings your production team into one control room.

Connect compatible phones and camera sources, monitor multiple angles, and direct the picture using Preview and Program. Prepare a shot before it reaches your audience, then switch with TAKE. Build single-camera, split-screen, picture-in-picture, or multi-camera layouts.

Key tools:
- Wireless camera operator invites and a multi-camera monitor
- Preview/Program switching and transitions
- Director camera and supported external capture sources
- Crew communication and camera controls where supported
- Audio selection, production graphics, recording and replay
- An interactive, searchable production guide

Designed for independent creators, interviews, podcasts, events and field crews.

Availability varies by device, network, permissions, subscription and production configuration. Professional subscription unlocks access; see current in-app pricing and purchase terms.

*Review this copy again after device testing: remove any capabilities not working in the submitted binary.*

**Keywords draft:** live production,multicamera,video switcher,broadcast,camera crew,streaming,video director

**Support:** https://scenepilot.ryanedavis.workers.dev/support  
**Privacy:** https://scenepilot.ryanedavis.workers.dev/privacy  
**Marketing:** https://scenepilot.ryanedavis.workers.dev/

## Store setup and the first public submission
- [ ] In App Store Connect, confirm **App Information**, iPhone/iPad platform support, price/availability, age rating, contact and copyright.
- [ ] Confirm 1024×1024 nontransparent icon visually; CI already validates its format.
- [ ] Upload genuine full-resolution screenshots under iPhone and iPad.
- [ ] Complete App Privacy accurately for current camera/audio, account, diagnostics and AI data processing.
- [ ] Confirm app review demo account is accessible and can explore Director functionality. For an auto-renewable subscription, Apple additionally requests an account with expired subscription so the reviewer can test purchase.
- [ ] Configure auto-renewable subscription product ID `com.icomputeranything.scenepilot.pro.monthly`, subscription group, localized name/description, $39.99 price target, review screenshot, and notifications. Confirm Apple IAP API keys and backend verification secrets without disclosing them.
- [ ] Confirm Apple Paid Apps agreement is active, and applicable Apple banking/tax entries complete for paid IAP. **These are Apple App Store requirements, unrelated to Maryland tax paperwork for other clothing businesses.** An individual Apple developer may provide the tax ID accepted by Apple based on their account status.
- [ ] Select Apple's processed uploaded iOS build, attach the first subscription and its group as required.
- [ ] Complete export compliance, content rights declarations and reviewer test notes.
- [ ] Click **Add for Review** and **Submit for Review** in App Store Connect; upload success does not do this automatically.
- [ ] Track review/approval and select immediate or manual public release.

## Official Apple references, checked Oct 28, 2026
- App review: https://developer.apple.com/app-store/review/guidelines/
- Screenshots: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
- First subscription submission: https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-in-app-purchase
- Public app submission: https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app/
- Reviewer account requirements: https://developer.apple.com/help/app-review/before-submitting-for-review/complete-review
- Apple paid agreements/tax: https://developer.apple.com/help/app-store-connect/manage-tax-information/provide-tax-information

## Current limitation
This report is **code/static/CI and release-automation QC**. No connected, authenticated App Store Connect browser session, physical iOS device, production Apple sandbox tester, or device screenshots were accessible to this audit. Therefore screenshot upload, App Store Connect submission state and real-device QA are **not claimed completed**. Do not use synthetic images presented as genuine app screenshots.
