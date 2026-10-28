import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateApiRequest } from "@/server/authenticated-api";
import { enforceAiRateLimit } from "@/server/ai-rate-limit";
import {
  createRedisHandoffStore,
  HandoffError,
  issueHandoffCode,
  redeemHandoffCode,
} from "@/server/native-auth-handoff";

const InputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("issue"), state: z.string().max(128) }),
  z.object({ action: z.literal("redeem"), code: z.string().max(64), state: z.string().max(128) }),
]);

function clientKey(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function errorResponse(error: unknown) {
  if (error instanceof Response && error.status === 429) {
    return Response.json(
      { error: "Too many attempts. Please try again shortly." },
      { status: 429 },
    );
  }
  if (error instanceof HandoffError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("[Native auth API] Request failed", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
  return Response.json({ error: "Couldn't finish sign-up. Please try again." }, { status: 502 });
}

export const Route = createFileRoute("/api/native-auth")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let input: z.infer<typeof InputSchema>;
        try {
          const raw = await request.text();
          if (raw.length > 1_000) {
            return Response.json({ error: "Request is too large." }, { status: 413 });
          }
          input = InputSchema.parse(JSON.parse(raw));
        } catch {
          return Response.json({ error: "Invalid sign-in request." }, { status: 400 });
        }

        try {
          if (input.action === "issue") {
            // Only a signed-in Custom Tab session can mint a code.
            const auth = await authenticateApiRequest(request);
            if ("response" in auth) return auth.response;
            await enforceAiRateLimit("native-auth-issue", auth.user.userId, 10);

            const { createFirebaseCustomToken } = await import("@/server/firebase-admin");
            const customToken = await createFirebaseCustomToken(auth.user.userId);
            const code = await issueHandoffCode(
              createRedisHandoffStore(),
              customToken,
              input.state,
            );
            return Response.json({ code });
          }

          await enforceAiRateLimit("native-auth-redeem", clientKey(request), 20);
          const customToken = await redeemHandoffCode(
            createRedisHandoffStore(),
            input.code,
            input.state,
          );
          return Response.json({ customToken });
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});
