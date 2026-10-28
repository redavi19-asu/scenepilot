# Screen sharing, monitor windows, and the installed beta

The web app and the TestFlight iPhone/iPad app are separate builds. A web deployment does not update assets bundled inside TestFlight. Running the iPad app on a Mac does not turn its web view into desktop Chrome. This change does not implement native multi-window support or ReplayKit broadcast capture for iOS.

## Templates
Open AI Studio below the editor, then Featured Video. The four cards are Turning Into Your Parents: The Store, Turning Into Your Parents: The Neighbor, Luxury Hotel Lobby Music Video, and Street Freestyle Music Video. These are generation presets, not playable example videos. Selecting or viewing a card does not generate media or spend tokens.

## Desktop monitors
In desktop Chrome use DRAG / POP OUT on Preview, Program or Main. Drag the handle at least 32 pixels to detach, or click it. Then move the new window by its system title bar to another screen. Multi-Monitor Desktop offers the other source windows and all nine cameras. Camera tiles still drag to Preview / Main for source assignment; their double-click shortcut opens a separate monitor.

Chrome may require pop-ups to be allowed for this site. Restore Workspace can be limited to one popup per gesture; reopen remaining windows individually. The Electron desktop wrapper now permits the named about:blank monitor portals. Detached windows share existing streams and stay silent.

## Screen / window ingest
On desktop Chrome click SELECT SCREEN / WINDOW and choose the authorized source in the browser picker. The selected screen enters Preview automatically. Press TAKE to send it to Program, recording, and an active broadcast. To keep it off air, leave it in Preview. The broadcast uses the Program compositor, not Preview directly.

On Mac, allow Chrome in System Settings > Privacy & Security > Screen & System Audio Recording when requested. A restart may be required. Audio depends on the selected source, browser, and OS; a Chrome tab can offer an audio checkbox while other sources may supply video only. Configure source audio in the mixer separately.

The Electron wrapper uses the macOS system picker where available and an explicit source chooser otherwise. The fallback shares video only. The TestFlight iPhone/iPad web view cannot capture other apps using getDisplayMedia; use desktop Chrome for this workflow.

## Verification limits
Unit tests cover socket success, error, early close, timeout, stale-connection recovery, invalid screen tracks, desktop popup policy, origin-scoped capture permissions and chooser cancellation. CI additionally runs the existing FFmpeg ingest integration test with WebM, fragmented MP4 and invalid input. These tests do not prove physical Mac screen permission behavior, physical iOS QA, or public App Store submission.

## Thumbnail artwork and release verification
The four featured cards ship local illustrative JPEG previews, labeled LOOK PREVIEW. They do not call fal.ai or spend Studio tokens. The artwork illustrates the template direction, rather than documenting a completed video generation.

The iOS release workflow now checks the uploaded build through App Store Connect, waits for processing, verifies assignment to an existing internal beta group, and verifies the internal testing state. It does not create tester groups, invite new people, or submit public App Store review. External beta review and the tester's Apple ID remain separate. The workflow summary reports the exact build number and whether existing internal groups permit iPad-app testing on Apple Silicon Macs.

Internal groups are checked read-only. Apple can reject attempts to add a build to an internal group, including groups that already receive builds automatically. Verification waits for IN_BETA_TESTING and checks actual group build relationships instead of sending that unsupported assignment.
