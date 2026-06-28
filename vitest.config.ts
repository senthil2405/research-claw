import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    env: {
      NEXT_PUBLIC_ALLOW_DEV_LOGIN: "true",
      // Point Prisma at the dev sqlite DB and force the mock Claude backend so
      // the chat-service integration test runs without a subscription.
      DATABASE_URL: `file:${resolve(__dirname, "prisma/dev.db")}`,
      CLAUDE_FORCE_MOCK: "true",
      // Deterministic AES-256 key (base64, 32 bytes) so crypto + key-service
      // tests don't depend on .env.local being loaded under Vitest.
      APP_ENCRYPTION_KEY: "MIrtAMfkd4iN1G+2QLZkskbthFQoN9D2gRwqN2A8Ewc=",
    },
    include: ["src/**/__tests__/**/*.{test,spec}.{ts,tsx}", "tests/unit/**/*.{test,spec}.{ts,tsx}"],
    css: false,
  },
});
