# Six-pad soundboard

Six user-loadable colored pads sit above the transition/audio control deck. The section starts collapsed and participates in Collapse all. Collapsing does not interrupt sounds. This ports the sample-pad workflow from the Swift GoGo Live app into the web audio environment; it does not embed the Swift engine.

Users can import audio (25 MB / 120 seconds maximum), record up to 30 seconds of microphone audio, rename, choose start/end positions, loop, clear, and stop all sounds. Pads start empty. No third-party reaction recordings are bundled. Supported file decoding and microphone recording depend on the browser. Samples are stored in IndexedDB per signed-in account on this device, not uploaded or synced. Storage failure is reported while retaining session playback.

A dedicated Web Audio stream joins the existing stable Program mixer track. Camera source selection and camera solo do not suppress this effects bus. Soundboard volume affects monitor and Program; local monitor only affects local speakers. Standby mutes the Program bus. Program must be running for recording/broadcast inclusion. The mic sampler records only the microphone. Use headphones to avoid acoustic feedback.

## Verification — November 7, 2026

- Local production build, lint (existing warnings), release invariants and production dependency audit passed.
- 107 non-encoder tests passed, including trim validation and soundboard routing, standby, source removal, and stable output-track tests.
- Local encoder integration test could not run: it requires Linux /usr/bin/ffmpeg, absent on this Mac. CI installs FFmpeg.
- Browser component fixture: imported a generated two-second WAV, renamed it, looped playback, stopped playback, restored the name/audio/loop after reload, and collapsed the section.
- Desktop 1280px layout and phone 390px / 320px layout checked, with no horizontal overflow. Phone pads measured 145px high. Screenshots are local fixture captures, not deployed UI or physical-device proof.
- Microphone recording and a real broadcast receiver still require device acceptance testing. No paid AI generation was used.

## Microphone repair — November 7, 2026

A screenshot from the TestFlight iPad app running on a Mac showed the generic unavailable message. The original code required both getUserMedia and MediaRecorder, so it never attempted capture when either browser API was absent. This was not evidence of a disconnected physical microphone.

The Apple app now captures through a registered native SoundboardRecorder Capacitor plugin using AVAudioRecorder, with WAV output, permission feedback, input selection, metering and a native 30-second recording limit. It restores the previous shared audio-session configuration and does not deactivate a session used by Program. Browser capture retains MediaRecorder, negotiates supported audio MIME types, selects an exact external microphone when chosen and clones an existing Director microphone when appropriate, so stopping a sample does not stop production. Empty recordings/errors retain the previous pad. Both paths display elapsed time and input levels. The outer card/editor/control surfaces now match the neighboring neutral production panels; the six performance-pad colors are retained.

Regression tests exercise native capture with both browser capture APIs absent, native empty/error results, exact USB input selection, browser final-chunk collection, input cleanup and Director track preservation. These mock tests do not prove physical USB hardware or Apple system permissions; verify those on the installed TestFlight build.
