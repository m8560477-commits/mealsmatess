import { createFileRoute } from "@tanstack/react-router";
import OpenAI from "openai";
import { z } from "zod";
import { AiLimitError, requireAiCredit } from "@/lib/ai-credits.server";
import { enforceAiRateLimit } from "@/server/ai-rate-limit";
import { authenticateApiRequest } from "@/server/authenticated-api";

const InputSchema = z.object({ message: z.string().trim().min(1).max(4000) });

function errorResponse(error: unknown) {
  if (error instanceof Response && error.status === 429) {
    return Response.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }
  if (error instanceof AiLimitError) {
    return Response.json({ error: error.message }, { status: 429 });
  }
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number(error.status)
      : undefined;
  console.error("[Mia API] Request failed", {
    name: error instanceof Error ? error.name : "UnknownError",
    status,
  });
  return Response.json(
    { error: "Mia couldn't respond right now. Please try again." },
    { status: status === 429 ? 503 : 502 },
  );
}

export const Route = createFileRoute("/api/mia")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateApiRequest(request);
        if ("response" in auth) return auth.response;

        if (!process.env["OPENAI_API_KEY"]?.trim()) {
          return Response.json({ error: "Mia is not configured yet." }, { status: 503 });
        }

        let input: z.infer<typeof InputSchema>;
        try {
          const raw = await request.text();
          if (raw.length > 16_000) {
            return Response.json({ error: "Request is too large." }, { status: 413 });
          }
          input = InputSchema.parse(JSON.parse(raw));
        } catch {
          return Response.json(
            { error: "Enter a message under 4000 characters." },
            { status: 400 },
          );
        }

        try {
          await requireAiCredit(auth.user.userId);
          await enforceAiRateLimit("ai_chat", auth.user.userId, 20);

          const client = new OpenAI({
            apiKey: process.env["OPENAI_API_KEY"],
            timeout: 45_000,
            maxRetries: 2,
          });
          const result = await client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content:
                  "You are Mia, the friendly AI assistant inside MealMate. Help users discover recipes, plan meals, understand nutrition, build shopping lists, and make practical food choices. Be warm, clear, and concise. Treat nutrition as an estimate, never invent facts, ask about allergies when relevant, and do not diagnose illnesses.",
              },
              { role: "user", content: input.message },
            ],
            max_completion_tokens: 800,
          });
          const reply = result.choices[0]?.message?.content?.trim();
          if (!reply) throw new Error("Empty response from OpenAI");
          return Response.json({ reply });
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});
