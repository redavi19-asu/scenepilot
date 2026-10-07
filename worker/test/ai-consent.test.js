import test from "node:test";
import assert from "node:assert/strict";
import { handleAiStudio } from "../ai-studio.js";

const user = { id: "consent-test", status: "active", accessStatus: "active" };
function environment() {
  return {
    FAL_KEY: "test-key-never-sent",
    DB: {
      prepare(sql) {
        assert.match(sql.trim(), /^CREATE /, "A denied request must not reserve tokens or create a job");
        return {};
      },
      batch: async () => []
    }
  };
}
const send = (body, env = environment()) => handleAiStudio(new Request("https://urbandirectorstudio.com/api/ai/generate", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
}), env, user);

test("AI sharing requires explicit current consent before spending tokens or contacting a provider", async () => {
  for (const consent of [undefined, false, true, "fal-ai-v0"]) {
    const response = await send({ templateId: "urban-fashion", images: ["data:image/png;base64,aGVsbG8="], aiSharingConsent: consent });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "ai_sharing_consent_required");
  }
});
test("accepted sharing consent still requires a valid generation template", async () => {
  const response = await send({ aiSharingConsent: "fal-ai-v1", templateId: "not-a-template" });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "Choose a valid AI template.");
});
