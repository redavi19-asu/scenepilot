// Capture the next Director camera without replacing the already-live Program track.
// Keep its microphone track stable across front/rear camera changes.
const RETRYABLE_CAMERA_ERRORS = new Set([
  "NotReadableError", "AbortError", "OverconstrainedError", "NotFoundError"
]);

export async function acquireDirectorCamera(mediaDevices, {
  facing,
  previousStream = null,
  previousFacing = "user"
}) {
  const video = mode => ({
    facingMode: { ideal: mode },
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 30 }
  });
  const request = mode => mediaDevices.getUserMedia({
    video: video(mode),
    // Reopening the microphone disrupts the on-air audio encoder on mobile Safari.
    audio: previousStream
      ? false
      : { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  });
  let captured;
  let actualFacing = facing;
  let restored = false;

  try {
    captured = await request(facing);
  } catch (error) {
    if (!previousStream || !RETRYABLE_CAMERA_ERRORS.has(error?.name)) throw error;

    // Some mobile browsers cannot open rear and front cameras simultaneously.
    // Release only the old VIDEO tracks; preserve audio and Program capture.
    for (const track of previousStream.getVideoTracks()) track.stop();
    try {
      captured = await request(facing);
    } catch (switchError) {
      // Restore the old camera when the requested lens is unavailable.
      try {
        captured = await request(previousFacing);
        actualFacing = previousFacing;
        restored = true;
      } catch {
        throw switchError;
      }
    }
  }

  if (!captured?.getVideoTracks?.().length) {
    throw new Error("The requested camera did not return video.");
  }

  if (!previousStream) return { stream: captured, facing: actualFacing, restored };

  const replacement = new MediaStream([
    ...captured.getVideoTracks(),
    ...previousStream.getAudioTracks()
  ]);
  // Only the video source is replaced. The original audio tracks remain alive.
  for (const track of previousStream.getVideoTracks()) track.stop();
  for (const track of captured.getAudioTracks()) track.stop();
  return { stream: replacement, facing: actualFacing, restored };
}
