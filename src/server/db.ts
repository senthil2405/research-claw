import { PrismaClient } from "@prisma/client";

// Production stores the DB connection strings (which embed the password)
// base64-encoded in *_B64 env vars, so no plaintext secret ever sits in an env
// value or committed file. Decode them into the plain vars before the Prisma
// client (or any consumer) reads them. Local dev/test set the plain vars
// directly (local Postgres, no password), so this is a no-op there.
for (const key of ["DATABASE_URL", "DIRECT_DATABASE_URL"] as const) {
  const b64 = process.env[`${key}_B64`];
  if (b64 && !process.env[key]) {
    process.env[key] = Buffer.from(b64, "base64").toString("utf8");
  }
}

// Prisma client singleton — avoids exhausting connections during Next.js HMR.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
