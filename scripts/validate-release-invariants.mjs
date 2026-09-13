import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function requireText(path, text, label) {
  const content = read(path);
  if (!content.includes(text)) {
    throw new Error(`Release invariant failed: ${label} (${path})`);
  }
}

requireText(
  "worker/index.js",
  "const roomIdentity = `${networkId}:${room}`;",
  "camera signaling must be namespaced by company network and room"
);

requireText(
  "worker/index.js",
  "async function validCameraJoinToken(",
  "camera invites must be validated server-side"
);

requireText(
  "worker/index.js",
  "i.room_code = ?",
  "camera invites must be room-scoped"
);

requireText(
  "worker/index.js",
  "i.network_id = ?",
  "camera invites must be company-scoped"
);

requireText(
  "src/BroadcastPanel.jsx",
  "broadcastNetworkId",
  "broadcast rooms must include tenant identity"
);

requireText(
  "src/BroadcastPanel.jsx",
  "serviceRoomCode",
  "broadcast rooms must use tenant-scoped service room codes"
);

requireText(
  "src/ReplayStudio.jsx",
  'scenepilot:edit:${networkId || "local"}:${roomCode || "default"}',
  "Replay Studio local projects must be namespaced by tenant and room"
);

requireText(
  "worker/index.js",
  "REALTIME_MAX_VIEWERS",
  "Realtime viewer ceiling must remain configurable"
);

requireText(
  "worker/index.js",
  "billingWindowForNetwork",
  "streaming allowance must support subscription billing windows"
);

requireText(
  "ios/App/App/StoreKitSubscriptionPlugin.swift",
  "StoreKit.Transaction.currentEntitlements",
  "native StoreKit entitlement verification must remain present"
);

requireText(
  "ios/App/App/MainViewController.swift",
  "registerPluginInstance(StoreKitSubscriptionPlugin())",
  "StoreKit plugin must be registered with Capacitor"
);

requireText(
  "src/storeKitSubscription.js",
  "com.icomputeranything.scenepilot.pro.monthly",
  "StoreKit product identifier must remain wired"
);

requireText(
  "worker/index.js",
  "handleAppleBillingSync",
  "Apple purchases must be verified by the backend"
);

console.log("Urban Director Studio release invariants: PASS");
