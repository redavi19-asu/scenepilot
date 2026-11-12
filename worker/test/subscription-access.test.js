import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import worker from '../index.js';
import { hasStudioAccess } from '../../shared/subscriptionAccess.js';

const hash = async value => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).toString('hex');
async function fixture() {
  const db = new DatabaseSync(':memory:');
  for (const file of ['0001_ica_saas.sql', '0002_scenepilot_networks.sql', '0006_signal_tickets.sql', '0012_master_email_access.sql']) db.exec(fs.readFileSync(`migrations/${file}`, 'utf8'));
  db.exec(`CREATE TABLE email_access_grants(email TEXT,product_slug TEXT,status TEXT,expires_at INTEGER);
    CREATE TABLE scenepilot_camera_invites(token_hash TEXT PRIMARY KEY,network_id TEXT,room_code TEXT,created_by TEXT,expires_at INTEGER,created_at INTEGER);
    INSERT INTO users(id,email,password_hash,password_salt,created_at) VALUES('customer','customer@example.com','','','0');
    INSERT INTO user_products VALUES('customer','product_scenepilot','pro','active','apple','0','9999999999999');
    INSERT INTO scenepilot_networks VALUES('network','Production','production','legacy-join','active','customer',0,0);`);
  db.prepare('INSERT INTO sessions(id,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(await hash('session'), 'customer', Date.now()+60000, Date.now());
  db.prepare('INSERT INTO scenepilot_camera_invites VALUES(?,?,?,?,?,?)').run(await hash('invite'), 'network', 'room', 'customer', Date.now()+60000, Date.now());
  const wrap = (sql, values=[]) => ({ bind: (...args) => wrap(sql,args), first: async () => db.prepare(sql).get(...values), run: async () => db.prepare(sql).run(...values) });
  let forwarded;
  const env = { DB: { prepare: sql => wrap(sql), batch: async statements => Promise.all(statements.map(statement=>statement.run())) }, ROOMS: { idFromName: value=>value, get: () => ({ fetch: async request => { forwarded=request; return new Response('connected'); } }) } };
  const post = (path, authenticated=true, data={network:'network',room:'room',join:'invite'}) => worker.fetch(new Request(`https://unit.test${path}`,{ method:'POST',headers:{'Content-Type':'application/json',...(authenticated?{Authorization:'Bearer session'}:{})},body:JSON.stringify(data) }),env);
  const signal = query => worker.fetch(new Request(`https://unit.test/signal?network=network&room=room&join=invite${query||''}`),env);
  return {db, env, post, signal, forwarded:()=>forwarded};
}

test('camera invitation alone cannot bypass a required subscription', async () => {
  const f=await fixture();
  assert.equal((await f.signal()).status,403);
  assert.equal((await f.post('/api/camera/access',false)).status,401);
  for (const [plan,status,expiry] of [['free','pending',null],['pro','suspended',null],['pro','active','1'],['free','active',null]]) {
    f.db.prepare('UPDATE user_products SET plan=?,access_status=?,expires_at=?').run(plan,status,expiry);
    assert.equal((await f.post('/api/camera/access')).status,403);
    assert.equal((await f.post('/api/media/ice')).status,403);
    assert.equal((await f.signal()).status,403);
  }
  f.db.close();
});

test('subscribed camera gets a scoped ticket but never Director privileges; expiry is rechecked', async () => {
  const f=await fixture();
  const response=await f.post('/api/camera/access');
  assert.equal(response.status,200);
  const {ticket}=await response.json();
  assert.ok(ticket);
  assert.equal((await f.signal(`&ticket=${ticket}`)).status,200);
  assert.equal(f.forwarded().headers.get('X-ScenePilot-Can-Direct'),'0');
  assert.equal(f.forwarded().headers.get('X-ScenePilot-User-Id'),'customer');
  const wrongRoom=await worker.fetch(new Request(`https://unit.test/signal?network=network&room=other&join=invite&ticket=${ticket}`),f.env);
  assert.equal(wrongRoom.status,403);
  f.db.exec("UPDATE user_products SET expires_at='1'");
  assert.equal((await f.signal(`&ticket=${ticket}`)).status,403);
  f.db.close();
});

test('paid camera still needs a valid invite; owner exemption remains', async () => {
  const f=await fixture();
  assert.equal((await f.post('/api/camera/access',true,{network:'network',room:'room',join:'wrong'})).status,403);
  f.db.exec("UPDATE users SET role='owner'; UPDATE user_products SET plan='free',access_status='pending'");
  assert.equal((await f.post('/api/camera/access')).status,200);
  f.db.close();
});

test('ordinary free/expired accounts are denied while active subscriptions and privileged accounts retain access', () => {
  const user={status:'active',role:'user',plan:'pro',accessStatus:'active',entitlementExpiresAt:2000};
  assert.equal(hasStudioAccess(user,1000),true);
  assert.equal(hasStudioAccess(user,2000),false);
  assert.equal(hasStudioAccess({...user,plan:'free'},1000),false);
  assert.equal(hasStudioAccess({...user,status:'suspended',role:'owner'},1000),false);
  assert.equal(hasStudioAccess({...user,role:'owner',plan:'free'},3000),true);
});

// The release bridge preserves only existing invite-based camera connections.
// Updated clients still obtain paid camera tickets; Director access never changes.
test('explicit legacy rollout bridge accepts valid camera invites without Director privileges', async () => {
  const f=await fixture();
  f.env.ALLOW_LEGACY_CAMERA_INVITES='true';
  f.db.exec("UPDATE user_products SET plan='free',access_status='pending'");
  assert.equal((await f.signal()).status,200);
  assert.equal(f.forwarded().headers.get('X-ScenePilot-Can-Direct'),'0');
  assert.equal((await f.post('/api/camera/access')).status,403);
  const invalid=await worker.fetch(new Request('https://unit.test/signal?network=network&room=other&join=invite'),f.env);
  assert.equal(invalid.status,403);
  delete f.env.ALLOW_LEGACY_CAMERA_INVITES;
  assert.equal((await f.signal()).status,403);
  f.db.close();
});
