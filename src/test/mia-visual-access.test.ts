// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  premium: vi.fn(),
  rpc: vi.fn(),
  rate: vi.fn(),
  text: vi.fn(),
  image: vi.fn(),
  speech: vi.fn(),
  track: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse: (value: unknown) => unknown = (value) => value;
    const builder = {
      middleware: () => builder,
      validator: (fn: typeof parse) => {
        parse = fn;
        return builder;
      },
      handler: (fn: (arg: unknown) => unknown) => (arg: { data: unknown }) =>
        fn({ data: parse(arg.data), context: { userId: "user-a" } }),
    };
    return builder;
  },
}));
vi.mock("@/lib/firebase-auth-middleware", () => ({ requireFirebaseAuth: {} }));
vi.mock("@/server/revenuecat", () => ({ requireActivePremium: m.premium }));
vi.mock("@/server/firebase-admin", () => ({ firebaseAdmin: { rpc: m.rpc } }));
vi.mock("@/lib/security.server", () => ({ enforceRateLimit: m.rate, trackEvent: m.track }));
vi.mock("@/lib/ai-engine.server", () => ({
  generateAiObject: m.text,
  generateAiImage: m.image,
  generateAiSpeech: m.speech,
}));
import { generateVisualExplanation } from "@/lib/visual.functions";
const request = { data: { prompt: "Explain simmer", scenes: 3, narration: false } };
beforeEach(() => {
  vi.resetAllMocks();
  m.premium.mockResolvedValue(undefined);
  m.rpc.mockResolvedValue({ data: { allowed: true }, error: null });
  m.rate.mockResolvedValue(undefined);
  m.track.mockResolvedValue(undefined);
  m.text.mockResolvedValue({
    title: "Simmer",
    kind: "educational",
    summary: "Gentle heat",
    style_note: "Simple",
    scenes: Array.from({ length: 3 }, () => ({
      heading: "Heat",
      narration: "Keep small bubbles.",
      subtitle: "Gentle bubbles",
      image_prompt: "A pot",
    })),
  });
  m.image.mockResolvedValue({ mediaType: "image/png", bytes: new Uint8Array([1]) });
});
describe("Mia Visual Mode access", () => {
  it("accepts a verified RevenueCat account without a legacy subscription row", async () => {
    const result = await generateVisualExplanation(request);
    expect(result.title).toBe("Simmer");
    expect(result.scenes).toHaveLength(3);
    expect(m.premium).toHaveBeenCalledWith("user-a");
    expect(m.rpc).toHaveBeenCalledWith("consume_ai_credit", { _user_id: "user-a" });
  });
  it("rejects users without verified access before generating", async () => {
    m.premium.mockRejectedValue(new Error("Premium required"));
    await expect(generateVisualExplanation(request)).rejects.toThrow("Premium required");
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.text).not.toHaveBeenCalled();
  });
  it("respects a server-side allowance denial", async () => {
    m.rpc.mockResolvedValue({ data: { allowed: false, reason: "daily" }, error: null });
    await expect(generateVisualExplanation(request)).rejects.toThrow("MEALMATE_LIMIT_AI_DAILY");
    expect(m.text).not.toHaveBeenCalled();
  });
});
