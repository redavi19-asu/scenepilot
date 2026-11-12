export function hasStudioAccess(user, now = Date.now()) {
  if (!user || user.status !== 'active') return false;
  if (user.role === 'owner' || user.role === 'admin') return true;
  return user.plan === 'pro' && user.accessStatus === 'active' &&
    !user.freeAccessVerificationRequired &&
    (!user.entitlementExpiresAt || Number(user.entitlementExpiresAt) > now);
}
