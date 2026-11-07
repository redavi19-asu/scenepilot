# Urban Director Studio desktop release QC

The Mac TestFlight build is currently the iPad compatibility app. It lacks the required Director video engine. The Web Director workaround does not fix that installed app. The Electron desktop target is a separate release path and must pass its own sign-in, hardware, sandbox and store checks.

## Verified work

- Camera session regressions cover stale slot cleanup, same-device reconnect, independent devices sharing an invite, stable slot numbers, nine-camera capacity, on-air signaling and disconnected Program routing.
- The native-video workflow runs real Electron on Mac and Windows and decodes synthetic video using the production WebRTC helper. Both runners pass with a responding local STUN fixture. It also builds a clearly labeled unsigned Windows installer solely as a QC artifact, without publishing or activating production download links. It does not exercise physical cameras, remote networking, store sandboxing or account sign-in. The isolated fixture serves its own localhost page and permits media permission checks for ICE interface enumeration and uses Studio media permission handling. Its hardware capture methods are disabled and no hardware capture API is called. Chromium's loopback-interface testing switch is enabled only in this fixture, and only genuine 127.0.0.1/::1 ICE candidates are exchanged. Hosted runner results do not certify real-device networking.
- Desktop permission checks restrict video, monitor placement and local-network permissions to the configured Studio origin.
- Screenshot review pack is saved separately. Edited desktop marketing images are not actual Android captures.

## Direct Mac and Windows distribution

`npm run package:mac:dmg` and `npm run package:win` retain mandatory code signing. Mac distribution additionally requires notarization and stapling; Windows installers require valid Authenticode signatures. The Mac after-pack hook removes Finder/resource-fork metadata from generated app bundles before signing. Locally, build outside the synced Documents tree (for example with `--config.directories.output=/tmp/uds-native-mac-qc-release`) because sync can reattach metadata after cleanup. A local Apple Silicon package built there passed deep/strict Developer ID signature verification before ZIP creation and after extraction; notarization and end-to-end acceptance remain open. The existing production-package workflow publishes download links only after signature verification. A local Developer ID certificate alone does not establish App Store readiness.

## Mac App Store target

The separate `electron/mas.config.cjs` selects the MAS Electron engine and App Sandbox entitlements. It requires an explicit absolute `UDS_MAS_PROFILE` path and unique positive `UDS_BUILD_NUMBER`. Profiles are ignored by Git. The profile must match the app ID, signing certificate, team and entitlements; distribution additionally requires an installer certificate.

- `npm run package:mac:store:dev` uses a development profile on a registered Apple Silicon Mac.
- `npm run package:mac:store` produces a universal MAS submission with distribution credentials.
- A normal Developer ID DMG cannot be submitted as the MAS build.
- Validate all nine inputs, microphone recording, audio routing, screen sharing, external-monitor pop-outs, recording/export and file dialogs under the actual sandbox before submission.

## Open release gates

- Mac App Store provisioning/distribution/installer credentials and a successfully tested sandbox build.
- Final signed-app validation of native desktop sign-in. The PKCE browser-to-app handoff, single-use code exchange, secure cookie storage and origin-checked IPC are implemented and tested; physical signed-app acceptance remains required.
- Windows production signing and actual installer/device verification.
- Actual sandbox purchase/restoration and a working reviewer account. The dedicated Electron MAS StoreKit adapter is implemented, including account UUID binding, server verification, latest-renewal lookup and unfinished-transaction retry. Unit tests do not substitute for an Apple sandbox purchase.
- Actual Android device captures, Play billing verification and signed store bundle.
- End-to-end camera quality, reconnect, audio, streaming and export verification on the final signed binaries.

References: [Electron MAS requirements](https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide), [electron-builder v26 MAS configuration](https://www.electron.build/v26/docs/mas/), [Apple audio-input entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.device.audio-input).


## Signing account verification — November 7

The existing Azure signing account `ica-code-signing` and profile `ica-control-production` are available through the shared ICA signing host. A disposable executable signing request succeeded; the corrected publisher probe starts from a compiled unsigned file. No replacement signing purchase is needed.

Apple notarization authentication succeeds with the existing credentials. Certificate/profile API access returns `FORBIDDEN_ERROR.PLA_NOT_ACCEPTED`, requiring the account holder to accept Apple's pending agreement. The current App Store record has an iOS 1.0 draft and a monthly subscription marked `MISSING_METADATA`; this is not a Mac submission.

The public landing page now uses genuine screenshots of the soundboard, graphics controls and editor. The private paper feed is excluded. The separately edited review pack uses clearly labeled demo stills and is not represented as a set of actual Android captures.
