import test from "node:test";
import assert from "node:assert/strict";
import { issueDirectorIceServers, DIRECTOR_TURN_TTL_SECONDS } from "../director-turn.js";

const validEnv = {
  DIRECTOR_TURN_KEY_ID: "a".repeat(32),
  DIRECTOR_TURN_KEY_SECRET: "private-key-not-for-browsers"
};

test("TURN credentials require Worker-only secrets", async () => {
  await assert.rejects(issueDirectorIceServers({}, async () => { throw new Error("should not fetch"); }),
    /TURN relay credentials are not configured/);
});

test("Cloudflare TURN credentials are short-lived and filtered for browser safety", async () => {
  let called = false;
  const result = await issueDirectorIceServers(validEnv, async (url, options) => {
    called = true;
    assert.match(url, /credentials\/generate-ice-servers$/);
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, "Bearer " + validEnv.DIRECTOR_TURN_KEY_SECRET);
    assert.equal(JSON.parse(options.body).ttl, DIRECTOR_TURN_TTL_SECONDS);
    return {
      ok: true,
      json: async () => ({
        iceServers: [
          { urls: ["stun:stun.cloudflare.com:3478"] },
          { urls: [
            "turn:turn.cloudflare.com:3478?transport=udp",
            "turns:turn.cloudflare.com:443?transport=tcp",
            "turn:turn.cloudflare.com:53?transport=udp",
            "turn:evil.example.com:3478?transport=udp"
          ], username: "ephemeral-user", credential: "ephemeral-password" }
        ]
      })
    };
  });
  assert.equal(called, true);
  assert.equal(result.iceServers.length, 2);
  assert.equal(result.iceServers[1].urls.length, 2);
  assert.equal(result.iceServers[1].username, "ephemeral-user");
  assert.ok(result.expiresAt > Date.now());
  assert.doesNotMatch(JSON.stringify(result), /private-key-not-for-browsers/);
});

test("TURN credentials cannot silently fall back to STUN-only", async () => {
  await assert.rejects(issueDirectorIceServers(validEnv, async () => ({
    ok: true,
    json: async () => ({ iceServers: [{ urls: ["stun:stun.cloudflare.com:3478"] }] })
  })), /no usable relay credentials/);
});
