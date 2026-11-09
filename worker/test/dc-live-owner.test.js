import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { handleDcLiveSubmissionTicket, handleDcLiveVerifyTicket } from '../index.js';

async function fixture(role = 'user') {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['0001_ica_saas.sql', '0002_scenepilot_networks.sql', '0012_master_email_access.sql']) {
    sqlite.exec(fs.readFileSync(`migrations/${file}`, 'utf8'));
  }
  sqlite.prepare("INSERT INTO users(id,email,password_hash,password_salt,role,created_at) VALUES('u','test@example.com','','',?,'0')").run(role);
  sqlite.exec("INSERT INTO user_products VALUES('u','product_scenepilot','pro','active','manual','0',NULL)");
  const session = 'test-session';
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(session))).toString('hex');
  sqlite.prepare("INSERT INTO sessions(id,user_id,expires_at,created_at) VALUES(?,'u',?,'0')").run(hash, String(Date.now() + 60000));
  const prepare = (sql, args = []) => ({
    bind: (...values) => prepare(sql, values),
    first: async () => sqlite.prepare(sql).get(...args) || null,
    run: async () => sqlite.prepare(sql).run(...args)
  });
  const env = { DB: { prepare, batch: async statements => Promise.all(statements.map(s => s.run())) } };
  const request = new Request('https://test.invalid/api/dc-live/submission-ticket', {
    method: 'POST', headers: { Authorization: `Bearer ${session}` }
  });
  return { sqlite, env, request };
}

test('customers and tenant admins cannot mint DC Live submission tickets', async () => {
  for (const role of ['user', 'admin']) {
    const { sqlite, env, request } = await fixture(role);
    try { assert.equal((await handleDcLiveSubmissionTicket(request, env)).status, 403); }
    finally { sqlite.close(); }
  }
});

test('owner can publish; an existing ticket becomes invalid immediately after owner privilege is removed', async () => {
  const { sqlite, env, request } = await fixture('owner');
  try {
    const response = await handleDcLiveSubmissionTicket(request, env);
    assert.equal(response.status, 201);
    const { token } = await response.json();
    assert.ok(token);
    const verify = () => handleDcLiveVerifyTicket(new Request('https://test.invalid/api/dc-live/verify-ticket', {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }
    }), env);
    assert.equal((await (await verify()).json()).valid, true);
    sqlite.exec("UPDATE users SET role='user'");
    assert.equal((await verify()).status, 401);
    sqlite.exec("UPDATE users SET role='owner',status='suspended'");
    assert.equal((await verify()).status, 401);
  } finally { sqlite.close(); }
});
