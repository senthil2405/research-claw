#!/usr/bin/env node
// Applies committed migrations in production (Fly release_command).
// Decodes the base64-encoded connection strings into the plain env vars first,
// so the DB password is never stored in plaintext in an env value. Lives under
// prisma/ (not scripts/) so it's included in the Docker image.
import { spawnSync } from "node:child_process";

for (const key of ["DATABASE_URL", "DIRECT_DATABASE_URL"]) {
  const b64 = process.env[`${key}_B64`];
  if (b64 && !process.env[key]) {
    process.env[key] = Buffer.from(b64, "base64").toString("utf8");
  }
}

const res = spawnSync("prisma", ["migrate", "deploy"], {
  stdio: "inherit",
  env: process.env,
});
process.exit(res.status ?? 1);
