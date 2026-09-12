import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const DATABASE_NAME = "ica-saas-db";
const CONFIG_PATH = "wrangler.jsonc";
const MIGRATION_PATH = "migrations/0001_ica_saas.sql";

function run(command, args) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["inherit", "pipe", "inherit"]
  });
}

function extractDatabaseId(info) {
  if (!info) return null;

  if (Array.isArray(info)) {
    for (const item of info) {
      const found = extractDatabaseId(item);
      if (found) return found;
    }
    return null;
  }

  if (typeof info !== "object") return null;

  for (const key of ["database_id", "uuid", "id"]) {
    const value = info[key];
    if (
      typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value)
    ) {
      return value;
    }
  }

  for (const value of Object.values(info)) {
    const found = extractDatabaseId(value);
    if (found) return found;
  }

  return null;
}

console.log("Urban Director Studio: locating Cloudflare D1 database...");

const rawInfo = run("npx", [
  "wrangler",
  "d1",
  "info",
  DATABASE_NAME,
  "--json"
]);

const info = JSON.parse(rawInfo);
const databaseId = extractDatabaseId(info);

if (!databaseId) {
  throw new Error(
    "Could not locate the D1 database UUID in Wrangler output."
  );
}

const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));

config.d1_databases = [
  {
    binding: "DB",
    database_name: DATABASE_NAME,
    database_id: databaseId,
    migrations_dir: "migrations"
  }
];

writeFileSync(
  CONFIG_PATH,
  JSON.stringify(config, null, 2) + "\n"
);

console.log(
  `Urban Director Studio: bound ${DATABASE_NAME} to env.DB (${databaseId})`
);

console.log("Urban Director Studio: applying D1 schema...");

execFileSync(
  "npx",
  [
    "wrangler",
    "d1",
    "execute",
    DATABASE_NAME,
    "--remote",
    "--file",
    MIGRATION_PATH,
    "--yes"
  ],
  {
    stdio: "inherit"
  }
);

console.log("Urban Director Studio: D1 setup complete.");
console.log("Next: git add wrangler.jsonc && git commit && git push");
