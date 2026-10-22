import { expect, it, vi } from "vitest";
import { publicEnvDefinitions } from "../../build/public-env";
import { handleFirestoreError, OperationType } from "@/lib/firebase";
it("only emits exact public names, including Android public billing configuration", () => {
  const result = publicEnvDefinitions({
    VITE_FIREBASE_API_KEY: "public-web-key",
    VITE_FIREBASE_API_KEY_PRIVATE: "must-not-ship",
    VITE_FIREBASE_SERVICE_ACCOUNT_JSON: "must-not-ship",
    FIREBASE_SERVICE_ACCOUNT_JSON: "must-not-ship",
    REVENUECAT_SECRET_API_KEY: "must-not-ship",
    VITE_REVENUECAT_ANDROID_API_KEY: "goog_public-test-only",
  });
  expect(JSON.stringify(result)).not.toContain("must-not-ship");
  expect(result["import.meta.env.VITE_REVENUECAT_ANDROID_API_KEY"]).toBe('"goog_public-test-only"');
});
it("refuses secret billing keys in a public variable", () =>
  expect(() =>
    publicEnvDefinitions({ VITE_REVENUECAT_ANDROID_API_KEY: "sk_test_not_a_real_key" }),
  ).toThrow(/public Android/));
it("does not expose account paths or raw provider errors through the browser", () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() =>
    handleFirestoreError(
      { code: "permission-denied", message: "secret-email@example.test" },
      OperationType.GET,
      "users/private-id",
    ),
  ).toThrow(/do not have access/);
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret-email|private-id/);
  log.mockRestore();
});
