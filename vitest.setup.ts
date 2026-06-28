import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Ensure React Testing Library tears down the DOM between tests.
afterEach(() => {
  cleanup();
});
