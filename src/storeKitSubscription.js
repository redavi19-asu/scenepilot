import { Capacitor, registerPlugin } from "@capacitor/core";
import { apiFetch } from "./runtimeApi";

export const APPLE_SUBSCRIPTION_PRODUCT_ID =
  "com.icomputeranything.scenepilot.pro.monthly";

const NativeStoreKit = registerPlugin("StoreKitSubscription");

export function isAppleStoreKitAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

async function apiJson(path, options = {}) {
  const response = await apiFetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      data.error ||
      `Urban Director Studio billing request failed (HTTP ${response.status}).`
    );
  }
  return data;
}

async function syncTransaction(transaction) {
  if (!transaction?.transactionId) {
    throw new Error("Apple did not return a transaction to verify.");
  }

  return apiJson("/api/billing/apple/sync", {
    method: "POST",
    body: JSON.stringify({
      transactionId: transaction.transactionId
    })
  });
}

export async function getAppleSubscriptionProduct() {
  if (!isAppleStoreKitAvailable()) {
    return { available: false, native: false };
  }

  return NativeStoreKit.getProduct({
    productId: APPLE_SUBSCRIPTION_PRODUCT_ID
  });
}

export async function purchaseAppleSubscription(appAccountToken) {
  if (!isAppleStoreKitAvailable()) {
    throw new Error("Apple subscriptions are available in the iPhone/iPad app.");
  }

  const result = await NativeStoreKit.purchase({
    productId: APPLE_SUBSCRIPTION_PRODUCT_ID,
    appAccountToken
  });

  if (result?.status === "purchased" && result.transaction) {
    return {
      ...result,
      entitlement: await syncTransaction(result.transaction)
    };
  }

  return result;
}

export async function restoreAppleSubscription() {
  if (!isAppleStoreKitAvailable()) {
    throw new Error("Restore Purchases is available in the iPhone/iPad app.");
  }

  const result = await NativeStoreKit.restore({
    productId: APPLE_SUBSCRIPTION_PRODUCT_ID
  });

  if (result?.active && result.transaction) {
    return {
      ...result,
      entitlement: await syncTransaction(result.transaction)
    };
  }

  const entitlement = await apiJson("/api/billing/apple/refresh", {
    method: "POST",
    body: "{}"
  }).catch(() => null);

  return { ...result, entitlement };
}

export async function refreshAppleSubscription() {
  if (isAppleStoreKitAvailable()) {
    const local = await NativeStoreKit.currentEntitlement({
      productId: APPLE_SUBSCRIPTION_PRODUCT_ID
    }).catch(() => null);

    if (local?.active && local.transaction?.transactionId) {
      return syncTransaction(local.transaction);
    }
  }

  return apiJson("/api/billing/apple/refresh", {
    method: "POST",
    body: "{}"
  });
}

export async function manageAppleSubscription() {
  if (!isAppleStoreKitAvailable()) {
    throw new Error("Subscription management is available in the iPhone/iPad app.");
  }
  return NativeStoreKit.manageSubscriptions();
}
