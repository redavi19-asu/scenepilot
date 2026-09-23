import fs from 'node:fs';

function replaceOnce(source, needle, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(needle)) throw new Error(`Could not find ${label}`);
  return source.replace(needle, replacement);
}

const workerPath = 'worker/index.js';
let worker = fs.readFileSync(workerPath, 'utf8');

worker = replaceOnce(
  worker,
  'import { ensureBundledMigrations } from "./migrations.js";\n',
  'import { ensureBundledMigrations } from "./migrations.js";\nimport { requestPasswordReset, resetPassword } from "./password-recovery.js";\n',
  'worker password recovery import'
);

worker = replaceOnce(
  worker,
  '  if (url.pathname === "/api/auth/login" && request.method === "POST") {\n    return handleLogin(request, env);\n  }\n\n  if (url.pathname === "/api/auth/logout" && request.method === "POST") {',
  '  if (url.pathname === "/api/auth/login" && request.method === "POST") {\n    return handleLogin(request, env);\n  }\n\n  if (url.pathname === "/api/auth/password/request" && request.method === "POST") {\n    return requestPasswordReset(request, env);\n  }\n\n  if (url.pathname === "/api/auth/password/reset" && request.method === "POST") {\n    return resetPassword(request, env);\n  }\n\n  if (url.pathname === "/api/auth/logout" && request.method === "POST") {',
  'worker password recovery routes'
);

fs.writeFileSync(workerPath, worker);

const portalPath = 'src/ScenePilotPortal.jsx';
let portal = fs.readFileSync(portalPath, 'utf8');

portal = replaceOnce(
  portal,
  'import "./ScenePilotPortal.css";\n',
  'import { ForgotPasswordPage, ResetPasswordPage } from "./PasswordRecovery.jsx";\nimport "./ScenePilotPortal.css";\n',
  'password recovery page import'
);

portal = replaceOnce(
  portal,
  '          {mode === "register" && (\n            <label className="sp-marketing-opt">',
  '          {mode === "login" && (\n            <button\n              type="button"\n              className="sp-secondary"\n              onClick={() => go("/forgot-password")}\n            >\n              FORGOT PASSWORD?\n            </button>\n          )}\n\n          {mode === "register" && (\n            <label className="sp-marketing-opt">',
  'forgot password button'
);

portal = replaceOnce(
  portal,
  '  if (cleanPath === "/login") {',
  '  if (cleanPath === "/forgot-password") {\n    return <ForgotPasswordPage/>;\n  }\n\n  if (cleanPath === "/reset-password") {\n    return <ResetPasswordPage/>;\n  }\n\n  if (cleanPath === "/login") {',
  'password recovery routes'
);

fs.writeFileSync(portalPath, portal);

const wranglerPath = 'wrangler.jsonc';
let wrangler = fs.readFileSync(wranglerPath, 'utf8');
wrangler = replaceOnce(
  wrangler,
  '    "APP_STORE_SUBSCRIPTION_PRODUCT_ID": "com.icomputeranything.scenepilot.pro.monthly"\n',
  '    "APP_STORE_SUBSCRIPTION_PRODUCT_ID": "com.icomputeranything.scenepilot.pro.monthly",\n    "ICA_AUTH_FROM_EMAIL": "I Computer Anything <accounts@mail.icomputeranything.com>",\n    "ICA_AUTH_PUBLIC_ORIGIN": "https://scenepilot.ryanedavis.workers.dev"\n',
  'password recovery worker vars'
);
fs.writeFileSync(wranglerPath, wrangler);

fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync(
  'docs/ACCOUNT_RECOVERY.md',
  '# ICA account recovery for Urban Director Studio\n\n' +
  'Urban Director Studio now includes a real Forgot Password flow against the shared ICA SaaS user database.\n\n' +
  '## One required Cloudflare secret\n\n' +
  'Add the existing Resend API key to the scenepilot Worker:\n\n' +
  '```bash\n' +
  'npx wrangler secret put RESEND_API_KEY\n' +
  '```\n\n' +
  'Do not commit the key. The reset link expires after 30 minutes, only a SHA-256 hash of the one-time token is stored, the new password is PBKDF2-hashed with a fresh salt, and existing ICA sessions are invalidated after a successful reset.\n'
);

console.log('Director password recovery patch applied.');
