#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "Urban Director Studio encoder update"
echo "Repository: $ROOT"

git fetch origin main
git checkout main
git pull --ff-only origin main

npm ci
npm run validate:release

restart_done=0

for service in urban-director-encoder.service scenepilot-encoder.service; do
  if systemctl --user list-unit-files "$service" >/dev/null 2>&1; then
    echo "Restarting user service: $service"
    systemctl --user daemon-reload
    systemctl --user restart "$service"
    systemctl --user --no-pager --full status "$service" | head -n 24 || true
    restart_done=1
    break
  fi

  if systemctl list-unit-files "$service" >/dev/null 2>&1; then
    echo "Restarting system service: $service"
    sudo systemctl daemon-reload
    sudo systemctl restart "$service"
    sudo systemctl --no-pager --full status "$service" | head -n 24 || true
    restart_done=1
    break
  fi
done

if [[ "$restart_done" -eq 0 ]] && command -v pm2 >/dev/null 2>&1; then
  for process in urban-director-encoder scenepilot-encoder; do
    if pm2 describe "$process" >/dev/null 2>&1; then
      echo "Restarting PM2 process: $process"
      pm2 restart "$process" --update-env
      pm2 status "$process"
      restart_done=1
      break
    fi
  done
fi

if [[ "$restart_done" -eq 0 ]]; then
  echo
  echo "No known encoder service was found."
  echo "The repository is updated and validated, but the running encoder was not restarted."
  echo "Run scripts/install-encoder-user-service.sh once to create the managed service,"
  echo "or restart your existing encoder process manually."
  exit 2
fi

PORT="${ENCODER_PORT:-8788}"
HOST="${ENCODER_HOST:-127.0.0.1}"

echo
echo "Checking encoder health at http://${HOST}:${PORT}/health ..."
for attempt in {1..10}; do
  if curl --fail --silent "http://${HOST}:${PORT}/health" >/tmp/urban-director-encoder-health.json; then
    cat /tmp/urban-director-encoder-health.json
    echo
    echo "Urban Director Studio encoder update: PASS"
    exit 0
  fi
  sleep 1
done

echo "Encoder restart completed, but health check did not respond."
exit 3
