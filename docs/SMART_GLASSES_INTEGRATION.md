# Urban Director Studio — Meta Smart Glasses Bridge

This project contains the web/Capacitor side of the Meta smart-glasses camera path in `src/smartGlasses.js`.

## Release status

Meta Wearables Device Access Toolkit is currently Developer Preview. Keep the native Meta SDK optional/development-only until Meta enables end-user distribution.

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

Current DAT v0.9 flow:

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
