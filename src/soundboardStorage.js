const DATABASE = "uds-soundboard";
export function sampleRange(duration, start, end) {
  const from = Math.max(0, Number(start) || 0);
  const to = Math.min(duration, Number(end));
  if (!Number.isFinite(to) || to <= from) throw new Error("End must be after start and within the sample.");
  return { start: from, end: to };
}
export async function sampleStore(account, operation, slot, value) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("pads");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("pads", operation === "get" ? "readonly" : "readwrite");
      const store = tx.objectStore("pads");
      const key = `${account}:${slot}`;
      const request = operation === "put" ? store.put(value, key) : store[operation](key);
      let result;
      request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Sample save interrupted."));
    });
  } finally { db.close(); }
}
