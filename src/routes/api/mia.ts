import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AiLimitError, requireAiCredit } from "@/lib/ai-credits.server";
import { generateAiText } from "@/lib/ai-engine.server";
import { enforceAiRateLimit } from "@/server/ai-rate-limit";
import { authenticateApiRequest } from "@/server/authenticated-api";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4_000),
});

const InputSchema = z
  .object({
    message: z.string().trim().min(1).max(4_000).optional(),
    messages: z.array(MessageSchema).min(1).max(24).optional(),
  })
  .superRefine((input, context) => {
    const messages =
      input.messages ?? (input.message ? [{ role: "user" as const, content: input.message }] : []);
    if (messages.length === 0 || messages.at(-1)?.role !== "user") {
      context.addIssue({
        code: "custom",
        message: "The conversation must end with a user message.",
      });
    }
    if (messages.reduce((total, message) => total + message.content.length, 0) > 20_000) {
      context.addIssue({ code: "custom", message: "Conversation history is too long." });
    }
  });

const MIA_INSTRUCTIONS =
  "You are Mia, the friendly AI assistant inside MealMate. Help users discover recipes, plan meals, understand nutrition, build shopping lists, and make practical food choices. Be warm, clear, and concise. Use the provided conversation history to answer follow-up questions. Treat nutrition as an estimate, never invent facts, ask about allergies when relevant, and do not diagnose illnesses.";

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
  const safeMessage =
    error instanceof Error && error.message.startsWith("MealMate AI ")
      ? error.message
      : "Mia couldn't respond right now. Please try again.";
  const responseStatus = status === 429 || safeMessage.startsWith("MealMate AI ") ? 503 : 502;
  return Response.json({ error: safeMessage }, { status: responseStatus });
}

export const Route = createFileRoute("/api/mia")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateApiRequest(request);
        if ("response" in auth) return auth.response;

        let input: z.infer<typeof InputSchema>;
        try {
          const raw = await request.text();
          if (raw.length > 64_000) {
            return Response.json({ error: "Request is too large." }, { status: 413 });
          }
          input = InputSchema.parse(JSON.parse(raw));
        } catch {
          return Response.json(
            { error: "Send a valid conversation with a user message under 4000 characters." },
            { status: 400 },
          );
        }

        try {
          await requireAiCredit(auth.user.userId);
          await enforceAiRateLimit("ai_chat", auth.user.userId, 20);
          const messages =
            input.messages ??
            (input.message ? [{ role: "user" as const, content: input.message }] : []);
          const reply = await generateAiText({
            feature: "chat.mia",
            instructions: MIA_INSTRUCTIONS,
            messages,
            timeoutMs: 35_000,
            maxRetries: 0,
          });
          return Response.json({ reply });
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});
