import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiRequest } from "@/server/authenticated-api";
import { enforceAiRateLimit } from "@/server/ai-rate-limit";
import { AiLimitError, requireAiCredit } from "@/lib/ai-credits.server";
import { getAiProviderConfiguration } from "@/lib/ai-engine.server";
import { analyzeScan, decodeScanImage, ScanError } from "@/lib/scanner.server";
import { MAX_SCAN_BODY_BYTES, ScanInputSchema, type ScanEvent } from "@/lib/scanner";

async function readInput(request: Request) {
  if (Number(request.headers.get("content-length")) > MAX_SCAN_BODY_BYTES)
    throw new Response(null, { status: 413 });
  if (!request.body) throw new Error("Missing body");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SCAN_BODY_BYTES) {
        await reader.cancel();
        throw new Response(null, { status: 413 });
      }
      body += decoder.decode(value, { stream: true });
    }
    return ScanInputSchema.parse(JSON.parse(body + decoder.decode()));
  } finally {
    reader.releaseLock();
  }
}

function scanMessage(error: unknown) {
  if (error instanceof ScanError || error instanceof AiLimitError) return error.message;
  if (error instanceof Error && /timeout|abort/i.test(error.name))
    return "The scan took too long. Your capture is kept so you can retry.";
  if (error instanceof Error && error.message.startsWith("MealMate AI ")) return error.message;
  return "MealMate couldn't finish this scan. Check your connection and try again.";
}

export const Route = createFileRoute("/api/scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateApiRequest(request);
        if ("response" in auth) return auth.response;
        let input;
        try {
          input = await readInput(request);
          if (input.kind === "image") decodeScanImage(input.imageDataUrl);
        } catch (error) {
          const oversized = error instanceof Response && error.status === 413;
          return Response.json(
            {
              error: oversized
                ? "This image is too large. Choose a smaller photo."
                : "Use a JPEG, PNG or WebP image, or a valid product barcode.",
            },
            { status: oversized ? 413 : 400 },
          );
        }
        try {
          await enforceAiRateLimit("ai_vision", auth.user.userId, 10);
          if (input.kind === "image") {
            if (!getAiProviderConfiguration().configured)
              return Response.json(
                { error: "MealMate AI is not configured for this server runtime." },
                { status: 503 },
              );
            // Reuse the existing plan allowance. No client-side premium bypass or new entitlement.
            await requireAiCredit(auth.user.userId);
          }
        } catch (error) {
          const limited =
            error instanceof AiLimitError || (error instanceof Response && error.status === 429);
          return Response.json(
            {
              error:
                error instanceof Response
                  ? "Too many scans. Please wait a moment."
                  : scanMessage(error),
            },
            { status: limited ? 429 : 503 },
          );
        }

        const abort = new AbortController();
        const signal = AbortSignal.any([abort.signal, request.signal, AbortSignal.timeout(45_000)]);
        let closed = false;
        const encoder = new TextEncoder();
        const body = new ReadableStream<Uint8Array>({
          async start(controller) {
            const emit = (event: ScanEvent) => {
              if (!closed && !request.signal.aborted)
                controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
            };
            try {
              await analyzeScan(input, emit, signal);
            } catch (error) {
              emit({ type: "error", message: scanMessage(signal.aborted ? signal.reason : error) });
            } finally {
              if (!closed) {
                closed = true;
                controller.close();
              }
            }
          },
          cancel() {
            closed = true;
            abort.abort();
          },
        });
        return new Response(body, {
          headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-store, no-transform",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
