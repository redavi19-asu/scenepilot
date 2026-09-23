# ICA account recovery for Urban Director Studio

Urban Director Studio now includes a real Forgot Password flow against the shared ICA SaaS user database.

## One required Cloudflare secret

Add the existing Resend API key to the scenepilot Worker:

```bash
npx wrangler secret put RESEND_API_KEY
```

Do not commit the key. The reset link expires after 30 minutes, only a SHA-256 hash of the one-time token is stored, the new password is PBKDF2-hashed with a fresh salt, and existing ICA sessions are invalidated after a successful reset.
