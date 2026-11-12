import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppleTransactionDelivery, watchAppleTransactionDelivery, canPurchaseAppleSubscription } from './appleTransactionDelivery.js';

const transaction = { transactionId: '123456' };
const active = { ok: true, entitlement: { active: true }, user: { id: 'customer', accessStatus: 'active' } };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('Apple transaction finishes only after server activation, coalescing simultaneous updates', async () => {
  const order = [];
  let activate;
  const deliver = createAppleTransactionDelivery({
    verify: async () => { order.push('verify'); await new Promise(resolve => { activate = resolve; }); order.push('activated'); return active; },
    finish: async () => { order.push('finish'); }
  });
  const purchase = deliver(transaction);
  const event = deliver(transaction);
  assert.equal(purchase, event);
  assert.deepEqual(order, ['verify']);
  activate();
  assert.equal(await purchase, active);
  assert.deepEqual(order, ['verify', 'activated', 'finish']);
});

test('failed verification leaves the transaction unfinished and allows retry', async () => {
  let available = false;
  let finishes = 0;
  const deliver = createAppleTransactionDelivery({
    verify: async () => { if (!available) throw Error('offline'); return active; },
    finish: async () => { finishes++; }
  });
  await assert.rejects(deliver(transaction), /offline/);
  assert.equal(finishes, 0);
  available = true;
  assert.equal(await deliver(transaction), active);
  assert.equal(finishes, 1);
});

test('malformed verification never finishes a transaction; verified revocation is processed', async () => {
  let result = { ok: true };
  let finishes = 0;
  const deliver = createAppleTransactionDelivery({ verify: async () => result, finish: async () => { finishes++; } });
  await assert.rejects(deliver(transaction), /did not confirm access/);
  assert.equal(finishes, 0);
  result = { ok: true, entitlement: { active: false } };
  assert.equal(await deliver(transaction), result);
  assert.equal(finishes, 1);
});

test('failed native completion can retry without losing a verified purchase', async () => {
  let attempts = 0;
  const deliver = createAppleTransactionDelivery({ verify: async () => active, finish: async () => { if (++attempts === 1) throw Error('bridge unavailable'); } });
  await assert.rejects(deliver(transaction), /bridge unavailable/);
  assert.equal(await deliver(transaction), active);
  assert.equal(attempts, 2);
});

test('delayed approval, launch recovery and foreground retry refresh customer access', async () => {
  let event, resume, offline = true;
  let pending = [transaction];
  let removed = 0;
  const users = [];
  const errors = [];
  const delivered = [];
  const stop = await watchAppleTransactionDelivery({
    subscribe: async callback => { event = callback; return { remove: async () => { removed++; } }; },
    onResume: async callback => { resume = callback; return { remove: async () => { removed++; } }; },
    pending: async () => ({ transactions: pending }),
    deliver: async tx => { delivered.push(tx.transactionId); if (offline) throw Error('offline'); return active; },
    refresh: async () => ({ user: { id: 'customer', accessStatus: offline ? 'pending' : 'active' } }),
    onUser: user => users.push(user.accessStatus),
    onError: error => errors.push(error.message)
  });
  await tick();
  assert.deepEqual(delivered, ['123456']);
  assert.deepEqual(users, ['pending']);
  assert.deepEqual(errors, ['offline']);
  offline = false;
  await resume();
  assert.equal(users.at(-1), 'active');
  pending = [];
  await event({ transaction: { transactionId: '789012' } });
  assert.equal(delivered.at(-1), '789012');
  stop();
  await event({ transaction: { transactionId: 'ignored' } });
  await resume();
  assert.equal(delivered.at(-1), '789012');
  assert.equal(removed, 2);
});

test('sign-out prevents an in-flight update changing the next account UI', async () => {
  let event, resolve;
  const users = [];
  const stop = await watchAppleTransactionDelivery({
    subscribe: async callback => { event = callback; return { remove: async () => {} }; },
    onResume: async () => ({ remove: async () => {} }),
    pending: async () => ({ transactions: [] }),
    deliver: () => new Promise(done => { resolve = done; }),
    refresh: async () => ({}), onUser: user => users.push(user)
  });
  await tick();
  const update = event({ transaction });
  stop();
  resolve(active);
  await update;
  assert.deepEqual(users, []);
});

test('purchase guard excludes owners, active subscribers, and unverified free access', () => {
  const customer = { id: 'customer', role: 'user', status: 'active', plan: 'pro', accessStatus: 'pending' };
  assert.equal(canPurchaseAppleSubscription(customer), true);
  assert.equal(canPurchaseAppleSubscription({ ...customer, accessStatus: 'suspended' }), true);
  for (const user of [null, { ...customer, role: 'owner' }, { ...customer, role: 'admin' }, { ...customer, accessStatus: 'active' }, { ...customer, freeAccessVerificationRequired: true }]) {
    assert.equal(canPurchaseAppleSubscription(user), false);
  }
});
