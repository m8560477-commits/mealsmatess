import { afterEach, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { streamAiText } from "@/lib/ai-engine.server";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it("streams actual AI SDK text events without waiting for the complete answer", async () => {
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: new ReadableStream({
        start(c) {
          c.enqueue({ type: "text-start", id: "reply" });
          c.enqueue({ type: "text-delta", id: "reply", delta: "Try " });
          c.enqueue({ type: "text-delta", id: "reply", delta: "tomato rice." });
          c.enqueue({ type: "text-end", id: "reply" });
          c.enqueue({
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
              inputTokens: { total: 5, noCache: 5, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: 4, text: 4, reasoning: 0 },
            },
          });
          c.close();
        },
      }),
    }),
  });
  const replies = [];
  for await (const text of streamAiText({
    feature: "chat.mia",
    prompt: "Dinner?",
    modelOverride: model,
  }))
    replies.push(text);
  expect(replies).toEqual(["Try ", "tomato rice."]);
  expect(model.doStreamCalls).toHaveLength(1);
});
it("rejects a truncated provider SSE response after delivering its partial text", async () => {
  vi.stubEnv("LOVABLE_API_KEY", "synthetic-test-key");
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response('data: {"choices":[{"delta":{"content":"Try rice"}}]}\n\n'),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
  const iterator = streamAiText({ feature: "chat.mia", prompt: "Dinner?" });
  expect(await iterator.next()).toMatchObject({ value: "Try rice", done: false });
  await expect(iterator.next()).rejects.toThrow();
});
