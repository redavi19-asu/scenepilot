// Run only after the production domain and provider callback URLs are verified.
import fs from "node:fs";
const origin = "https://urbandirectorstudio.com";
const health = await fetch(`${origin}/health`);
const state = await health.json();
if (!health.ok || state.service !== "Urban Director Studio" || !state.ok) throw new Error("The production domain is not serving a healthy Director backend.");
for (const filename of ["src/runtimeApi.js", "electron/main.cjs", "wrangler.jsonc", ".github/workflows/ci.yml"]) {
  const content = fs.readFileSync(filename, "utf8").replaceAll("https://scenepilot.ryanedavis.workers.dev", origin);
  fs.writeFileSync(filename, content);
}
console.log("Production origin prepared. Deploy once provider callbacks are authorized and tested.");
