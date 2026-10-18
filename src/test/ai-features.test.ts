import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  lovableFetch,
  getAiGatewayUrl,
  getLovableApiKey,
  DEFAULT_AI_GATEWAY_URL,
  DEFAULT_GROQ_CHAT_MODEL,
} from "@/lib/lovable-ai.server";

describe("MealMate Independent AI Server (lovable-ai.server)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("Configuration & Credentials", () => {
    it("uses default documented endpoint https://ai.gateway.lovable.dev/v1", () => {
      delete process.env.LOVABLE_AI_GATEWAY_URL;
      delete process.env.AI_GATEWAY_URL;
      expect(getAiGatewayUrl()).toBe(DEFAULT_AI_GATEWAY_URL);
      expect(getAiGatewayUrl()).toBe("https://ai.gateway.lovable.dev/v1");
    });

    it("allows custom gateway override via LOVABLE_AI_GATEWAY_URL", () => {
      process.env.LOVABLE_AI_GATEWAY_URL = "https://custom-gateway.internal/v1/";
      expect(getAiGatewayUrl()).toBe("https://custom-gateway.internal/v1");
    });

    it("throws a descriptive AI_CONFIG_ERROR when LOVABLE_API_KEY is missing", () => {
      delete process.env.LOVABLE_API_KEY;
      expect(() => getLovableApiKey()).toThrow(/AI_CONFIG_ERROR: Missing LOVABLE_API_KEY/);
    });

    it("returns trimmed LOVABLE_API_KEY when provided", () => {
      process.env.LOVABLE_API_KEY = "  lov_test_key_12345  ";
      expect(getLovableApiKey()).toBe("lov_test_key_12345");
    });
  });

  describe("API Request Dispatching", () => {
    it("sends direct requests to Lovable AI Gateway with Bearer and Lovable-API-Key headers", async () => {
      process.env.LOVABLE_API_KEY = "lov_test_secret_key";
      delete process.env.LOVABLE_AI_GATEWAY_URL;

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "Sample response" } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
      vi.stubGlobal("fetch", mockFetch);

      const requestBody = JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: "Hello chef" }],
      });

      const response = await lovableFetch("/chat/completions", {
        method: "POST",
        body: requestBody,
      });

      expect(response.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [calledUrl, calledInit] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(calledUrl).toBe("https://ai.gateway.lovable.dev/v1/chat/completions");
      expect(calledInit.method).toBe("POST");
      expect(calledInit.body).toBe(requestBody);

      const headers = calledInit.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer lov_test_secret_key");
      expect(headers["Lovable-API-Key"]).toBe("lov_test_secret_key");
      expect(headers["Content-Type"]).toBe("application/json");

      // Verify NO fallback to Lovable Cloud backend edge functions
      expect(calledUrl).not.toContain("/functions/v1/ai-gateway");
    });

    it("uses the existing Groq key for text chat when Lovable is not configured", async () => {
      delete process.env.LOVABLE_API_KEY;
      process.env.GROQ_API_KEY = "groq_test_key";
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: "Hello, Chef." } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
      vi.stubGlobal("fetch", mockFetch);

      const response = await lovableFetch("/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: "Hello chef" }],
        }),
      });

      expect(response.ok).toBe(true);
      const [url, request] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
      expect(JSON.parse(String(request.body))).toMatchObject({
        model: DEFAULT_GROQ_CHAT_MODEL,
        messages: [{ role: "user", content: "Hello chef" }],
      });
      expect(request.headers).toMatchObject({ Authorization: "Bearer groq_test_key" });
      expect(request.headers).not.toHaveProperty("Lovable-API-Key");
    });

    it("does not surface an upstream HTML error page to the app", async () => {
      process.env.LOVABLE_API_KEY = "lov_test_key";
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response("<!doctype html><html><body>upstream failure</body></html>", {
            status: 502,
            headers: { "Content-Type": "text/html" },
          }),
        ),
      );

      const result = await lovableFetch("/chat/completions", {
        method: "POST",
        body: JSON.stringify({ model: "google/gemini-2.5-flash" }),
      }).catch((error: unknown) => error);

      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toContain("HTML error page instead of JSON");
      expect((result as Error).message).not.toContain("<html>");
      expect((result as Error).message).not.toContain("upstream failure");
    });

    it("rejects unauthorized paths", async () => {
      process.env.LOVABLE_API_KEY = "lov_test_key";
      await expect(lovableFetch("/unsupported/path", { body: "{}" })).rejects.toThrow(
        /AI_INVALID_PATH/,
      );
    });

    it("throws AI_AUTHENTICATION_FAILED with status and explanation on 401/403", async () => {
      process.env.LOVABLE_API_KEY = "invalid_key";

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ error: "Invalid API key" }), {
            status: 401,
            statusText: "Unauthorized",
          }),
        ),
      );

      await expect(
        lovableFetch("/chat/completions", {
          method: "POST",
          body: JSON.stringify({ model: "google/gemini-2.5-flash" }),
        }),
      ).rejects.toThrow(/AI_AUTHENTICATION_FAILED \(HTTP 401\)/);
    });

    it("throws AI_PAYMENT_REQUIRED on 402 credits exhausted", async () => {
      process.env.LOVABLE_API_KEY = "active_key_no_credits";

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ error: "Credits exhausted" }), {
            status: 402,
          }),
        ),
      );

      await expect(
        lovableFetch("/chat/completions", {
          method: "POST",
          body: JSON.stringify({ model: "google/gemini-2.5-flash" }),
        }),
      ).rejects.toThrow(/AI_PAYMENT_REQUIRED \(HTTP 402\)/);
    });
  });

  describe("Core AI Features Routing", () => {
    beforeEach(() => {
      process.env.LOVABLE_API_KEY = "lov_valid_key";
    });

    it("1. Mia Chef Chat: routes successfully through lovableFetch and parses assistant response", async () => {
      const mockChatAnswer =
        "You can substitute buttermilk with 1 cup milk plus 1 tbsp lemon juice.";
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              choices: [{ message: { content: mockChatAnswer } }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        ),
      );

      const res = await lovableFetch("/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You are MealMate's kitchen assistant." },
            { role: "user", content: "What can I substitute for buttermilk?" },
          ],
        }),
      });

      const json = await res.json();
      expect(json.choices[0].message.content).toBe(mockChatAnswer);
    });

    it("2. AI Recipe Creation: routes through lovableFetch with JSON output format", async () => {
      const mockRecipe = {
        name: "Authentic Bobotie",
        description:
          "Classic South African spiced minced meat bake with savoury egg custard topping.",
        cuisine: "South African",
        category: "Dinner",
        country: "South Africa",
        diet_tags: ["High Protein"],
        meal_type: "Dinner",
        cooking_time_minutes: 45,
        difficulty: "Medium",
        servings: 4,
        calories: 520,
        protein_g: 38,
        carbs_g: 22,
        fat_g: 28,
        ingredients: [
          { name: "Ground beef", quantity: "500g" },
          { name: "Curry powder", quantity: "2 tbsp" },
        ],
        steps: ["Brown the mince with onion and curry", "Top with egg-milk mix and bake"],
        fun_fact: "Considered one of the national dishes of South Africa.",
        image_prompt: "Golden baked bobotie garnished with bay leaves",
      };

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              choices: [{ message: { content: JSON.stringify(mockRecipe) } }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        ),
      );

      const res = await lovableFetch("/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: "Create a recipe for Bobotie" }],
        }),
      });

      const json = await res.json();
      const parsed = JSON.parse(json.choices[0].message.content);
      expect(parsed.name).toBe("Authentic Bobotie");
      expect(parsed.cuisine).toBe("South African");
      expect(parsed.ingredients).toHaveLength(2);
    });

    it("3. Meal Planning: routes through lovableFetch and parses multi-day plan", async () => {
      const mockPlan = {
        plan: [
          {
            day: 1,
            meal_type: "Breakfast",
            name: "Pap with fresh milk and honey",
            calories: 380,
            short_reason: "Traditional energizing breakfast",
          },
          {
            day: 1,
            meal_type: "Dinner",
            name: "Grilled Chicken Breast with Chakalaka",
            calories: 520,
            short_reason: "High protein dinner with spicy vegetable relish",
          },
        ],
      };

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              choices: [{ message: { content: JSON.stringify(mockPlan) } }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        ),
      );

      const res = await lovableFetch("/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You are a certified nutritionist." },
            { role: "user", content: "Build a 1-day meal plan" },
          ],
        }),
      });

      const json = await res.json();
      const planData = JSON.parse(json.choices[0].message.content);
      expect(planData.plan).toHaveLength(2);
      expect(planData.plan[0].name).toContain("Pap");
    });

    it("4. Recipe Import: routes through lovableFetch to infer recipes from scraped video metadata", async () => {
      const mockImported = {
        name: "Crispy Smashed Potatoes",
        description: "Trending viral crispy smashed potatoes with garlic herb butter.",
        cuisine: "American",
        category: "Snacks",
        country: "USA",
        diet_tags: ["Vegetarian"],
        meal_type: "Side",
        cooking_time_minutes: 35,
        difficulty: "Easy",
        servings: 4,
        calories: 220,
        protein_g: 4,
        carbs_g: 32,
        fat_g: 9,
        ingredients: [{ name: "Baby potatoes", quantity: "500g" }],
        steps: ["Boil potatoes until fork tender", "Smash flat and roast at 220C"],
        fun_fact: "Double baking ensures maximum crispiness.",
        image_prompt: "Golden smashed potatoes with flaky sea salt",
      };

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              choices: [{ message: { content: JSON.stringify(mockImported) } }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        ),
      );

      const res = await lovableFetch("/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You are MealMate's video-to-recipe assistant." },
            { role: "user", content: "URL: https://www.tiktok.com/@chef/video/12345" },
          ],
        }),
      });

      const json = await res.json();
      const parsed = JSON.parse(json.choices[0].message.content);
      expect(parsed.name).toBe("Crispy Smashed Potatoes");
      expect(parsed.steps).toHaveLength(2);
    });
  });
});
