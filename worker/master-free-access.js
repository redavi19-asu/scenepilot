export async function readMasterFreeAccess(db, email, product, now = Date.now()) {
  if (!db || !email) return null;
  try {
    return await db.prepare(`SELECT email, product_slug, expires_at FROM email_access_grants
      WHERE email = ? AND product_slug = ? AND status = 'active'
        AND (expires_at IS NULL OR expires_at > ?) LIMIT 1`)
      .bind(String(email).trim().toLowerCase(), product, now).first() || null;
  } catch {
    console.error('ICA free-access lookup unavailable');
    return null; // Missing migration/binding never grants free access; paid access is independent.
  }
}
