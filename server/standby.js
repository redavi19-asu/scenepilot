// Runs on Debian, independently of the Director device. When its browser or
// camera ingest disappears, viewers get a real encoded standby feed, not an
// expired HLS playlist. A connected Director can take the Program back on air.
export function standbyFfmpegArgs(inputBase, room) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(room)) {
    throw new Error("Invalid standby broadcast room.");
  }
  return [
    "-hide_banner", "-loglevel", "warning", "-nostdin", "-re",
    "-f", "lavfi", "-i", "color=c=0x121915:s=640x360:r=15",
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-vf",
    "drawtext=text='PLEASE STAND BY':fontcolor=white:fontsize=31:x=(w-text_w)/2:y=(h-text_h)/2,drawtext=text='The live program will resume shortly':fontcolor=white:fontsize=16:x=(w-text_w)/2:y=(h-text_h)/2+48",
    "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency",
    "-pix_fmt", "yuv420p", "-g", "15", "-keyint_min", "15",
    "-sc_threshold", "0", "-b:v", "500k",
    "-c:a", "aac", "-ar", "48000", "-b:a", "64k",
    "-f", "flv", `${String(inputBase).replace(/\/+$/, "")}/${room}`
  ];
}

export function sessionStatus(job) {
  if (!job) return { active: false, mode: "off", destinations: [] };
  const hasLiveIngest = Boolean(job.socket && job.ingestProcess);
  const hasStandby = Boolean(job.standbyProcess);
  return {
    active: true,
    room: job.room,
    mode: hasLiveIngest ? "program" : hasStandby ? "standby" : "connecting",
    ingestConnected: hasLiveIngest,
    destinations: job.accepted.map(destination => destination.id),
    startedAt: job.startedAt,
    expiresAt: job.streamExpiresAt
  };
}
