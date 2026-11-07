const CODE_TTL_MS = 90_000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const STATE = /^[A-Za-z0-9_-]{32,128}$/;
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
const CODE = /^[a-f0-9]{64}$/;
const encode = new TextEncoder();
const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
const token = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export async function desktopHash(value) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encode.encode(value))));
}
export async function desktopChallenge(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encode.encode(value)));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function validDesktopCallback(value) {
  const match = /^http:\/\/127\.0\.0\.1:([1-9]\d{3,4})\/callback$/.exec(String(value || ''));
  return Boolean(match && Number(match[1]) >= 1024 && Number(match[1]) <= 65535);
}
function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } });
}
async function issueDesktopSession(db, userId, browserSessionId, request, now) {
  const raw = token(), id = await desktopHash(raw), expiresAt = now + SESSION_TTL_MS;
  const result = await db.batch([
    db.prepare(`INSERT INTO sessions (id,user_id,expires_at,created_at,user_agent)
      SELECT ?,s.user_id,MIN(CAST(s.expires_at AS INTEGER),?),s.created_at,? FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.id=? AND s.user_id=? AND s.expires_at>? AND u.status='active'`)
      .bind(id, expiresAt, request.headers.get('User-Agent') || '', browserSessionId, userId, now),
    db.prepare(`INSERT OR IGNORE INTO director_email_access_proofs (user_id,session_id,verified_at)
      SELECT p.user_id,?,p.verified_at FROM director_email_access_proofs p
      JOIN sessions original ON original.id=? AND original.user_id=p.user_id
      WHERE p.user_id=? AND (p.session_id=? OR (p.session_id='password-recovery' AND p.verified_at<=original.created_at))
      AND EXISTS (SELECT 1 FROM sessions WHERE id=?) ORDER BY p.verified_at DESC LIMIT 1`)
      .bind(id, browserSessionId, userId, browserSessionId, id)
  ]);
  if (Number(result[0]?.meta?.changes) !== 1) throw new Error('The browser sign-in expired. Sign in again.');
  // Preserve the original authentication time and expiry. Delegation must not
  // extend a stolen session or turn an older unverified session into email proof.
  const issued = await db.prepare('SELECT expires_at FROM sessions WHERE id=?').bind(id).first();
  if (!issued) throw new Error('The browser sign-in expired.');
  return { sessionToken: raw, expiresAt: Number(issued.expires_at) };
}
export async function handleDesktopAuth(request, env, { getCurrentUser, sessionHash }) {
  if (request.method !== 'POST') return json({ error: 'Use POST for desktop sign-in.' }, 405);
  if (!env.DB) return json({ error: 'Account service is unavailable.' }, 503);
  const url = new URL(request.url), origin = request.headers.get('Origin');
  // Approval is a same-origin authenticated browser action. Code redemption
  // also accepts a native client without an Origin, protected by PKCE.
  if ((url.pathname.endsWith('/authorize') && origin !== url.origin) || (origin && origin !== url.origin)) {
    return json({ error: 'Open sign-in from the Studio app.' }, 403);
  }
  let body; try { body = await request.json(); } catch { return json({ error: 'Invalid sign-in request.' }, 400); }
  if (!body || typeof body !== 'object') return json({ error: 'Invalid sign-in request.' }, 400);
  const now = Date.now();
  if (url.pathname === '/api/auth/desktop/authorize') {
    const user = await getCurrentUser(request, env);
    if (!user) return json({ error: 'Sign in before connecting Studio.' }, 401);
    const browserSessionId = await sessionHash(request);
    if (!browserSessionId || !CHALLENGE.test(body.challenge || '') || !STATE.test(body.state || '') || !validDesktopCallback(body.redirectUri)) {
      return json({ error: 'This app sign-in link is invalid. Start again in Studio.' }, 400);
    }
    const code = token();
    await env.DB.prepare('DELETE FROM director_desktop_auth_codes WHERE expires_at<=?').bind(now).run();
    await env.DB.prepare(`INSERT INTO director_desktop_auth_codes
      (id,user_id,browser_session_id,pkce_challenge,redirect_uri,expires_at,created_at) VALUES (?,?,?,?,?,?,?)`)
      .bind(await desktopHash(code), user.id, browserSessionId, body.challenge, body.redirectUri, now + CODE_TTL_MS, now).run();
    const destination = new URL(body.redirectUri);
    destination.searchParams.set('code', code); destination.searchParams.set('state', body.state);
    return json({ redirectUrl: destination.href });
  }
  if (url.pathname === '/api/auth/desktop/exchange') {
    if (!CODE.test(body.code || '') || !VERIFIER.test(body.verifier || '') || !validDesktopCallback(body.redirectUri)) {
      return json({ error: 'This app sign-in expired or is invalid.' }, 400);
    }
    // One atomic redemption: wrong verifiers do not consume a valid code,
    // concurrent/replayed requests cannot issue a second session, and revoking
    // the browser session or account invalidates pending authorizations.
    const row = await env.DB.prepare(`DELETE FROM director_desktop_auth_codes
      WHERE id=? AND pkce_challenge=? AND redirect_uri=? AND expires_at>?
      AND EXISTS (SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id
        WHERE s.id=director_desktop_auth_codes.browser_session_id
        AND s.user_id=director_desktop_auth_codes.user_id AND s.expires_at>? AND u.status='active')
      RETURNING user_id,browser_session_id`)
      .bind(await desktopHash(body.code), await desktopChallenge(body.verifier), body.redirectUri, now, now).first();
    if (!row) return json({ error: 'This app sign-in expired or is invalid. Start again in Studio.' }, 400);
    try { return json(await issueDesktopSession(env.DB, row.user_id, row.browser_session_id, request, now)); }
    catch { return json({ error: 'The browser sign-in expired. Sign in again.' }, 400); }
  }
  return json({ error: 'Unknown desktop sign-in route.' }, 404);
}
