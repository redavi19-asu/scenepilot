// Ensure failed handshakes cannot later become orphaned live connections.
export function waitForIngestSocket(socket, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      socket.onopen = null;
      socket.onerror = null;
      socket.onclose = null;
    };
    const fail = message => {
      cleanup();
      try { socket.close(); } catch { /* Already closed. */ }
      reject(new Error(message));
    };
    const timer = setTimeout(() => fail("Urban Director Studio ingest connection timed out."), timeoutMs);
    socket.onopen = () => { cleanup(); resolve(); };
    socket.onerror = () => fail("Urban Director Studio could not open the secure ingest connection.");
    socket.onclose = () => fail("Urban Director Studio ingest closed before it connected.");
  });
}

export function releaseIngestConnection(ref, socket) {
  if (ref.current.socket !== socket) return false;
  ref.current = { recorder: null, socket: null };
  return true;
}
