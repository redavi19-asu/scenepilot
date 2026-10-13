# Program ingest failures

The encoder's `/health` endpoint proves API reachability, not video playback.
An authenticated WebSocket must deliver a complete MediaRecorder container,
FFmpeg must publish H.264/AAC to local RTMP, and the public HLS playlist must
advance with decodable segments before playback is verified.

Do not apply `-avioflags direct` to the non-seekable MediaRecorder input pipe.
On Debian FFmpeg 7.1.5 this reproduces `EBML header parsing failed` with valid
WebM. Preserve FFmpeg's input probe buffering and its initial decoded packets.
Keep low-latency settings on the output encoder instead.

Handle child-process and stdin errors: an FFmpeg exit can otherwise produce
an unhandled `EPIPE`, crash the API, and disconnect unrelated broadcasts.
Throttle the WebSocket when stdin is backpressured and bound process cleanup
after a producer disconnects.

Run the real-codec regression test on a Linux host with `/usr/bin/ffmpeg`,
`/usr/bin/ffprobe`, Node, and the repository dependencies installed:

```sh
node --test server/test/encoder-ingest.test.mjs
```

It uses an isolated API on a dynamically allocated loopback port, temporary
output files, and generated credentials. It verifies WebM and fragmented MP4
produce H.264/AAC and malformed input leaves the API running.

For the system service, inspect:

```sh
journalctl -u scenepilot-encoder -n 80 --no-pager
```

For the user service, add `--user` and use `urban-director-encoder.service`.
Never paste the encoder environment file or ingest protocol tokens into logs.
