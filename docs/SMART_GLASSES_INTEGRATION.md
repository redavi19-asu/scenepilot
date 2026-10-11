# Urban Director Studio — Meta Smart Glasses Bridge

This project contains the web/Capacitor side of the Meta smart-glasses camera path in `src/smartGlasses.js`.

## Release status

Meta Wearables Device Access Toolkit 1.0 began rolling out September 30, 2026. See https://developers.meta.com/wearables/faq/ for Meta's current supported devices and APIs.

**Product status (2026-10-11):** The QR-operator Front / Back / Meta camera selector, web/Capacitor JPEG-to-WebRTC bridge, and native **iOS** `UrbanSmartGlassesPlugin.swift` implementation are committed on the Meta feature branch. The iOS project now references Meta DAT **1.0.0** (`MWDATCore`, `MWDATCamera`), with registration deep-link handling, callback, camera permission and frames. **No real glasses test or production distribution has occurred.** There is **no Android native bridge** yet. Production release is blocked until a signed iPhone/TestFlight build, Meta Developer Center app ID and client token, and paired-glasses QA are completed.

**Security:** Meta video joins through the existing, short-lived, room-scoped QR camera invite on the phone. It is a camera-operator source only, not a second Director login or a second production session.

**Audio:** Until a native Meta microphone integration is implemented, the Director phone's selected microphone is used for the Meta camera source.

**Switching:** The camera UI offers Front Camera, Back Camera and Meta Glasses. The source is selected before connecting or replaced inside the existing WebRTC camera stream without changing the camera slot; existing native plugin availability checks prevent misleading "connected" behavior. Keep the old phone video and microphone operational if the Meta connection is unavailable.

**Before release:** Verify macOS Xcode archive, provision real Meta Developer Center credentials (stored as GitHub Actions secrets, not in code), test actual glasses and registration/permissions, QR first-join/rejoin, phone lens switching, audio, and background recovery. Verify public App Store distribution requirements with Meta; use an approved beta/TestFlight path until cleared. Add a separate Android bridge before claiming Android glasses support.

## Native plugin contract

Register a Capacitor plugin named:

`UrbanSmartGlasses`

### Methods

#### getStatus()
Returns:

```json
{
  "available": true,
  "connected": true,
  "width": 360,
  "height": 640
}
```

Return `available: false` when the DAT SDK is not present or no supported integration is enabled in the build.

#### startRegistration()
Starts Meta AI / Wearables registration.

#### startStream({ fps })
Starts the selected glasses camera stream. The JS layer currently requests the active Urban Director quality profile FPS.

#### stopStream()
Stops the wearable camera stream and releases the session.

### Events

Emit event name:

`frame`

Payload:

```json
{
  "base64": "<JPEG bytes encoded as base64>",
  "width": 360,
  "height": 640
}
```

The JS bridge draws those frames to an offscreen canvas and uses `canvas.captureStream()` to turn the wearable camera into a normal MediaStream. From there it uses the existing Urban Director WebRTC, ISO recording, multiview, Program, and replay pipeline.

## Meta DAT iOS reference flow

Previous v0.9 reference flow; **update this against DAT 1.0 before production implementation**:

- Add Meta package with Swift Package Manager.
- Add `MWDATCore` and `MWDATCamera`.
- Configure Meta callback URL scheme, external accessory protocol, Bluetooth usage description, and required background modes.
- Call `Wearables.configure()`.
- Complete registration via Meta AI.
- Create a `DeviceSession` with `AutoDeviceSelector`.
- Start the session.
- Add camera using `StreamConfiguration(videoCodec: .raw, resolution: .low, frameRate: 24)`.
- Listen to `videoFramePublisher`.
- Convert each frame to JPEG and emit it through the Capacitor `frame` event.

## Meta DAT Android reference flow

Current DAT v0.9 flow:

- Initialize `Wearables`.
- Complete Meta registration and camera permission.
- Create a session using `AutoDeviceSelector`.
- Start the session.
- Add camera with `StreamConfiguration`.
- Collect `camera.stream.videoStream`.
- Encode each received frame to JPEG and emit it through the Capacitor `frame` event.

## Production optimization

The JPEG-to-canvas bridge is the compatibility path because it feeds the existing browser/WebRTC stack without a rewrite. Before a high-volume release, replace the frame bridge with a native WebRTC video source when practical to reduce CPU and memory overhead.
