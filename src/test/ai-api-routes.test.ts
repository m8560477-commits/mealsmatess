import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route as MiaRoute } from "@/routes/api/mia";
import { Route as ImageRoute } from "@/routes/api/recipe-image";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  credit: vi.fn(),
  rateLimit: vi.fn(),
  text: vi.fn(),
  image: vi.fn(),
  readRecipe: vi.fn(),
  readPantry: vi.fn(),
}));
vi.mock("@/server/authenticated-api", () => ({ authenticateApiRequest: mocks.auth }));
vi.mock("@/lib/ai-credits.server", async (original) => ({
  ...(await original<typeof import("@/lib/ai-credits.server")>()),
  requireAiCredit: mocks.credit,
}));
vi.mock("@/server/ai-rate-limit", () => ({ enforceAiRateLimit: mocks.rateLimit }));
vi.mock("@/lib/ai-engine.server", () => ({ generateAiText: mocks.text }));
vi.mock("@/lib/recipe-image-request.server", () => ({ requestRecipeImage: mocks.image }));

type Handler = (context: { request: Request }) => Promise<Response>;
const miaPost = (MiaRoute.options.server as { handlers: { POST: Handler } }).handlers.POST;
const imagePost = (ImageRoute.options.server as { handlers: { POST: Handler } }).handlers.POST;
function request(body: unknown) {
  return {
    request: new Request("https://example.test/api/ai", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    user: {
      userId: "synthetic-user",
      firebase: {
        from: () => ({
          select: () => ({
            eq: () => ({ maybeSingle: mocks.readRecipe, limit: mocks.readPantry }),
          }),
        }),
      },
    },
  });
  mocks.readRecipe.mockResolvedValue({ data: { id: "firebaseRecipe123" }, error: null });
  mocks.readPantry.mockResolvedValue({ data: [{ name: "rice", quantity: "1 cup" }], error: null });
  mocks.credit.mockResolvedValue(undefined);
  mocks.rateLimit.mockResolvedValue(undefined);
  mocks.text.mockResolvedValue("Use oat milk with lemon juice.");
  mocks.image.mockResolvedValue({ imageUrl: "https://example.test/toast.png", source: "AI" });
});

describe("Mia API", () => {
  it("returns an assistant answer using the supplied conversation", async () => {
    const messages = [
      { role: "user", content: "A buttermilk substitute?" },
      { role: "assistant", content: "Milk and lemon." },
      { role: "user", content: "What if I avoid dairy?" },
    ];
    const response = await miaPost(request({ messages }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reply: "Use oat milk with lemon juice." });
    expect(mocks.text).toHaveBeenCalledWith(
      expect.objectContaining({ messages, feature: "chat.mia" }),
    );
  });

  it("includes the user's saved onboarding preferences in Mia's instructions", async () => {
    mocks.readRecipe.mockResolvedValue({
      data: {
        preferences: {
          allergies: ["peanuts"],
          dietary_restrictions: ["Vegan"],
          goal: "Save money",
        },
      },
      error: null,
    });
    const response = await miaPost(request({ message: "Suggest dinner" }));
    expect(response.status).toBe(200);
    const instructions = mocks.text.mock.calls[0]?.[0].instructions;
    expect(instructions).toContain("peanuts");
    expect(instructions).toContain("Vegan");
    expect(instructions).toContain("Save money");
  });

  it("uses the authenticated pantry and current step for a spoken conversation", async () => {
    const recipe = { name: "Tomato rice", steps: ["Wash rice", "Add tomatoes"], step: 1 };
    const response = await miaPost(request({ message: "What next?", voice: true, recipe }));
    expect(response.status).toBe(200);
    expect(mocks.readPantry).toHaveBeenCalledOnce();
    const instructions = mocks.text.mock.calls[0]?.[0].instructions;
    expect(instructions).toContain('"name":"rice"');
    expect(instructions).toContain('"step":1');
    expect(instructions).toContain("one step at a time");
  });

  it("rejects out-of-range cooking steps before generating a reply", async () => {
    const response = await miaPost(
      request({ message: "Next", voice: true, recipe: { name: "Rice", steps: ["Boil"], step: 3 } }),
    );
    expect(response.status).toBe(400);
    expect(mocks.text).not.toHaveBeenCalled();
  });

  it("rejects malformed conversations before spending credits", async () => {
    const response = await miaPost(
      request({ messages: [{ role: "assistant", content: "Hello" }] }),
    );
    expect(response.status).toBe(400);
    expect(mocks.credit).not.toHaveBeenCalled();
    expect(mocks.text).not.toHaveBeenCalled();
  });

  it("reports a safe provider failure without exposing internal details", async () => {
    mocks.text.mockRejectedValue(new Error("private provider request details"));
    const response = await miaPost(request({ message: "Help with dinner" }));
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("private provider");
  });
});

describe("recipe image API", () => {
  it("accepts Firebase document IDs and passes them to the shared service", async () => {
    const response = await imagePost(request({ recipeId: "firebaseRecipe123" }));
    expect(response.status).toBe(200);
    expect(mocks.image).toHaveBeenCalledWith("synthetic-user", "firebaseRecipe123");
  });

  it("checks recipe access before generating a photo", async () => {
    mocks.readRecipe.mockResolvedValue({ data: null, error: null });
    const response = await imagePost(request({ recipeId: "privateRecipe123" }));
    expect(response.status).toBe(404);
    expect(mocks.image).not.toHaveBeenCalled();
  });
});

it.each([miaPost, imagePost])("rejects unauthenticated AI calls", async (handler) => {
  mocks.auth.mockResolvedValue({
    response: Response.json({ error: "Sign in to continue." }, { status: 401 }),
  });
  const response = await handler(request({ message: "Hello", recipeId: "firebaseRecipe123" }));
  expect(response.status).toBe(401);
  expect(mocks.text).not.toHaveBeenCalled();
  expect(mocks.image).not.toHaveBeenCalled();
});
