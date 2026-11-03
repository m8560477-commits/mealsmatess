import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateApiRequest } from "@/server/authenticated-api";
import { enforceAiRateLimit } from "@/server/ai-rate-limit";

const inputSchema = z.object({ text: z.string().trim().min(1).max(4000) }).strict();
// ElevenLabs' documented example voice; set ELEVENLABS_VOICE_ID to choose Mia's voice.
const DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb";
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const error = (message: string, status: number) =>
  Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

export const Route = createFileRoute("/api/mia-speech")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateApiRequest(request);
        if ("response" in auth) return auth.response;
        let input: z.infer<typeof inputSchema>;
        try {
          const raw = await request.text();
          if (raw.length > 20_000) return error("Request is too large.", 413);
          input = inputSchema.parse(JSON.parse(raw));
        } catch {
          return error("Provide a valid reply to speak.", 400);
        }
        const key = process.env["ELEVENLABS_API_KEY"]?.trim();
        const voice = process.env["ELEVENLABS_VOICE_ID"]?.trim() || DEFAULT_VOICE;
        if (!key || !/^[A-Za-z0-9_-]{1,100}$/.test(voice))
          return error("Mia's voice is not configured yet.", 503);
        try {
          await enforceAiRateLimit("mia_speech", auth.user.userId, 12);
          const response = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", "xi-api-key": key },
              body: JSON.stringify({ text: input.text, model_id: "eleven_multilingual_v2" }),
              signal: AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]),
            },
          );
          if (
            !response.ok ||
            !response.headers.get("content-type")?.toLowerCase().startsWith("audio/")
          )
            return error("Mia's voice is temporarily unavailable. Please try again.", 502);
          const length = Number(response.headers.get("content-length") ?? 0);
          if (length > MAX_AUDIO_BYTES || !response.body)
            return error("Mia's voice response was invalid.", 502);
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let size = 0;
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              size += value.byteLength;
              if (size > MAX_AUDIO_BYTES) {
                await reader.cancel();
                return error("Mia's voice response was too large.", 502);
              }
              chunks.push(value);
            }
          } finally {
            reader.releaseLock();
          }
          if (!size) return error("Mia's voice response was empty.", 502);
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
          }
          return new Response(bytes.buffer, {
            headers: {
              "Content-Type": "audio/mpeg",
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch (cause) {
          if (cause instanceof Response && cause.status === 429)
            return error("Too many voice requests. Please try again shortly.", 429);
          if (request.signal.aborted) return error("Voice request interrupted.", 499);
          console.error("[Mia speech] Provider request failed", {
            name: cause instanceof Error ? cause.name : "UnknownError",
          });
          return error("Mia's voice is temporarily unavailable. Please try again.", 502);
        }
      },
    },
  },
});
