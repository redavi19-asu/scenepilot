#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_DIR="$HOME/.config/systemd/user"
ENV_DIR="$HOME/.config/urban-director-studio"
SERVICE_PATH="$SERVICE_DIR/urban-director-encoder.service"
ENV_PATH="$ENV_DIR/encoder.env"

mkdir -p "$SERVICE_DIR" "$ENV_DIR"

if [[ ! -f "$ENV_PATH" ]]; then
  cat >"$ENV_PATH" <<EOF
ENCODER_HOST=127.0.0.1
ENCODER_PORT=8788
ENCODER_API_TOKEN=CHANGE_ME
SCENEPILOT_INPUT_BASE=rtmp://127.0.0.1/live
SCENEPILOT_PUBLIC_INGEST_URL=wss://encoder.icomputeranything.com
SCENEPILOT_RECORDING_ROOT=$HOME/scenepilot-data/recordings
SCENEPILOT_RECORDING_RETENTION_HOURS=72
SCENEPILOT_STORAGE_WARNING_PERCENT=80
EOF
  chmod 600 "$ENV_PATH"
  echo "Created $ENV_PATH"
  echo "Set ENCODER_API_TOKEN in that file before starting the service."
fi

cat >"$SERVICE_PATH" <<EOF
[Unit]
Description=Urban Director Studio Encoder
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$ROOT
EnvironmentFile=$ENV_PATH
ExecStart=/usr/bin/env node $ROOT/server/encoder.js
Restart=always
RestartSec=3
TimeoutStopSec=10

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable urban-director-encoder.service

echo "Installed: $SERVICE_PATH"
echo "Environment: $ENV_PATH"

if grep -q '^ENCODER_API_TOKEN=CHANGE_ME$' "$ENV_PATH"; then
  echo "Service was not started because ENCODER_API_TOKEN still needs to be set."
  exit 0
fi

systemctl --user restart urban-director-encoder.service
systemctl --user --no-pager --full status urban-director-encoder.service | head -n 30 || true
