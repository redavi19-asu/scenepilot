export function screenCaptureError(error) {
  switch (error?.name) {
    case "NotAllowedError":
      return "SHARING CANCELLED OR DENIED — allow screen recording for Chrome in Mac System Settings > Privacy & Security > Screen & System Audio Recording, then restart Chrome if requested.";
    case "NotReadableError":
      return "MAC / DEVICE BLOCKED CAPTURE — check Screen & System Audio Recording permission, then select the window again.";
    case "InvalidStateError":
      return "CLICK SELECT SCREEN / WINDOW AGAIN WHILE THIS STUDIO WINDOW IS FOCUSED.";
    case "NotFoundError":
      return "NO CAPTURE SOURCE FOUND — open the window you want to share, then select it again.";
    default:
      return "SCREEN CAPTURE FAILED — try another window or use desktop Chrome.";
  }
}

export function validateScreenCapture(capture) {
  if (!capture?.getVideoTracks?.().some(track => track.readyState === "live")) {
    capture?.getTracks?.().forEach(track => track.stop());
    throw new Error("No live screen video was selected.");
  }
  return capture;
}
