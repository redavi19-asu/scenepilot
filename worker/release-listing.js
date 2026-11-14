import { hasStudioAccess } from "../shared/subscriptionAccess.js";

// Never expose release URLs to a guest or an account without an active entitlement.
// A public GitHub release is still independently downloadable by its direct URL;
// use private object storage for strict distribution control.
export function releaseListingForUser(env, user) {
  const urls = {
    windows: String(env.DIRECTOR_WINDOWS_DOWNLOAD_URL || "").trim(),
    macArm: String(env.DIRECTOR_MAC_ARM_DOWNLOAD_URL || "").trim(),
    macIntel: String(env.DIRECTOR_MAC_INTEL_DOWNLOAD_URL || "").trim(),
    android: String(env.DIRECTOR_ANDROID_DOWNLOAD_URL || "").trim()
  };
  const entitled = hasStudioAccess(user);
  return {
    available: Object.fromEntries(Object.entries(urls).map(([platform, url]) => [platform, Boolean(url)])),
    ...Object.fromEntries(Object.entries(urls).map(([platform, url]) => [platform, entitled ? url : ""]))
  };
}
