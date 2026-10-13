import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

vi.mock("@better-auth/infra/client", () => ({ sentinelClient: () => ({ id: "sentinel-test" }) }));

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
