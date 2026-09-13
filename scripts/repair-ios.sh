#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Urban Director Studio iOS repair =="

echo "1/3 Syncing Capacitor iOS assets..."
npm run mobile:sync

echo "2/3 Resolving Swift Package dependencies..."
xcodebuild   -resolvePackageDependencies   -project ios/App/App.xcodeproj   -scheme App

echo "3/3 Opening Xcode..."
open ios/App/App.xcodeproj

echo "iOS repair complete. Press Run in Xcode."
