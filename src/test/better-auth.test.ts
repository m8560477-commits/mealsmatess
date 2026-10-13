import { describe, expect, it, vi } from "vitest";

describe("Better Auth server configuration", () => {
  it("initializes the official Infra plugin and the Netlify Drizzle adapter", async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "test-only-signing-value-longer-than-thirty-two-characters");
    try {
      const { getAuth } = await import("@/lib/auth.server");
      const auth = getAuth();
      const context = await auth.$context;
      expect(context.options.plugins?.some(plugin => plugin.id === "dash")).toBe(true);
      expect(context.options.emailAndPassword?.enabled).toBe(true);
      expect(context.options.emailAndPassword?.requireEmailVerification).toBe(true);
      expect(context.options.rateLimit?.storage).toBe("database");
      expect(context.options.advanced?.database?.generateId).toBeTypeOf("function");
      expect(await auth.api.getSession({ headers: new Headers() })).toBeNull();
    } finally { vi.unstubAllEnvs(); }
  });
});
