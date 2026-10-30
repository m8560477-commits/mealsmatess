import { describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => ({ server: (handler: unknown) => handler }),
  createStart: (configuration: () => unknown) => configuration(),
}));
vi.mock("@/lib/firebase-auth-attacher", () => ({ attachFirebaseAuth: {} }));
import { startInstance } from "@/start";
type Middleware = (context: {
  request: Request;
  next: () => Promise<Response>;
}) => Promise<Response>;
const middleware = (startInstance as unknown as { requestMiddleware: Middleware[] })
  .requestMiddleware[1]!;
async function policy(url: string) {
  return middleware({ request: new Request(url), next: async () => new Response("page") });
}
describe("Consumer microphone policy", () => {
  it("allows first-party microphone permission and the offline worker", async () => {
    const response = await policy("https://mealsmates.site/chat");
    expect(response.headers.get("permissions-policy")).toContain("microphone=(self)");
    expect(response.headers.get("content-security-policy")).toContain("worker-src 'self' blob:");
  });
  it.each([
    "https://hub.mealsmates.site/",
    "https://partner.mealsmates.site/",
    "https://mealsmates.site/partner/dashboard",
    "https://mealsmates.site/hub",
  ])("retains the Hub policy at %s", async (url) => {
    const response = await policy(url);
    expect(response.headers.get("permissions-policy")).toContain("microphone=()");
    expect(response.headers.get("content-security-policy")).not.toContain("worker-src");
  });
});
