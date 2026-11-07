import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: { getIdToken: vi.fn(async () => "synthetic-token") } }));
vi.mock("@/lib/firebase-core", () => ({ waitForFirebaseAuth: async () => mocks.user }));
import { postAuthenticatedAi } from "@/lib/ai-api";
import { readJsonLines } from "@/lib/json-lines";
function stream(parts: string[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      parts.forEach((p) => controller.enqueue(new TextEncoder().encode(p)));
      controller.close();
    },
  });
}
beforeEach(() => vi.unstubAllGlobals());
it("decodes split JSON and UTF-8 without dropping the last event", async () => {
  const bytes = new TextEncoder().encode('{"text":"Crêpes"}\n{"type":"done"}');
  const chunks = new ReadableStream<Uint8Array>({
    start(c) {
      for (const byte of bytes) c.enqueue(new Uint8Array([byte]));
      c.close();
    },
  });
  const results = [];
  for await (const event of readJsonLines(chunks)) results.push(event);
  expect(results).toEqual([{ text: "Crêpes" }, { type: "done" }]);
});
it("shows response text progressively and only accepts a completed reply", async () => {
  const onText = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          stream([
            '{"type":"text","text":"Try "}\n',
            '{"type":"text","text":"tomato rice."}\n{"type":"done"}\n',
          ]),
          { headers: { "content-type": "application/x-ndjson" } },
        ),
    ),
  );
  expect(await postAuthenticatedAi("/api/mia", { stream: true }, { onText })).toEqual({
    reply: "Try tomato rice.",
  });
  expect(onText.mock.calls.map((c) => c[0])).toEqual(["Try ", "Try tomato rice."]);
});
it.each([
  ['{"type":"text","text":"Partial"}\n', /interrupted/],
  ['{"type":"error","error":"MealMate AI is busy right now."}\n', /busy/],
])(
  "rejects incomplete and failed streams without treating partial text as success",
  async (body, message) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(body as string, { headers: { "content-type": "application/x-ndjson" } }),
      ),
    );
    await expect(postAuthenticatedAi("/api/mia", { stream: true })).rejects.toThrow(
      message as RegExp,
    );
  },
);
it("does not send a duplicate request when the caller already aborted", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const controller = new AbortController();
  controller.abort();
  await expect(
    postAuthenticatedAi("/api/mia", {}, { signal: controller.signal }),
  ).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
