import { hasStudioAccess } from "../shared/subscriptionAccess.js";
// Coalesce StoreKit's purchase result and update event while verification runs.
export function createAppleTransactionDelivery({ verify, finish }) {
  const inFlight = new Map();
  return function deliver(transaction) {
    const id = transaction?.transactionId;
    if (!id) return Promise.reject(new Error("Apple did not return a transaction to verify."));
    if (inFlight.has(id)) return inFlight.get(id);
    const delivery = (async () => {
      const result = await verify(transaction);
      if (!result?.ok || typeof result.entitlement?.active !== "boolean") {
        throw new Error("Apple purchase verification did not confirm access. Use Restore Purchases to retry.");
      }
      // An expired/revoked transaction can also be fully processed by the server.
      await finish(transaction);
      return result;
    })();
    inFlight.set(id, delivery);
    const clear = () => { if (inFlight.get(id) === delivery) inFlight.delete(id); };
    void delivery.then(clear, clear);
    return delivery;
  };
}

export function canPurchaseAppleSubscription(user) {
  return Boolean(user?.id) && !["owner", "admin"].includes(user.role) &&
    !hasStudioAccess(user) && !user.freeAccessVerificationRequired;
}

// Attach the live listener before recovering events emitted before sign-in.
export async function watchAppleTransactionDelivery({ subscribe, onResume, pending, deliver, refresh, onUser, onError = () => {} }) {
  let stopped = false;
  let refreshing;
  const update = result => { if (!stopped && result?.user) onUser(result.user); };
  const receive = async transaction => {
    if (stopped) return;
    try { update(await deliver(transaction)); } catch (error) {
      if (!stopped) onError(error);
      // Leave failed deliveries unfinished for resume, relaunch or Restore.
    }
  };
  const reconcile = () => {
    if (stopped || refreshing) return refreshing;
    refreshing = (async () => {
      const result = await pending();
      for (const transaction of result.transactions || []) await receive(transaction);
      if (!stopped) update(await refresh());
    })().catch(error => { if (!stopped) onError(error); }).finally(() => { refreshing = null; });
    return refreshing;
  };
  const transactions = await subscribe(event => receive(event.transaction));
  let resume;
  try { resume = await onResume(reconcile); }
  catch (error) { await transactions.remove(); throw error; }
  void reconcile();
  return () => {
    stopped = true;
    void transactions.remove();
    void resume.remove();
  };
}
