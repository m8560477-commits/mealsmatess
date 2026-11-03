import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/api/mia-speech";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), limit: vi.fn(), fetch: vi.fn() }));
vi.mock("@/server/authenticated-api", () => ({ authenticateApiRequest: mocks.auth }));
vi.mock("@/server/ai-rate-limit", () => ({ enforceAiRateLimit: mocks.limit }));
type Handler = (context: { request: Request }) => Promise<Response>;
const post = (Route.options.server as { handlers: { POST: Handler } }).handlers.POST;
const request = (body: unknown) => ({
  request: new Request("https://example.test/api/mia-speech", {
    method: "POST",
    body: JSON.stringify(body),
  }),
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ELEVENLABS_API_KEY", "synthetic-test-key");
  vi.stubEnv("ELEVENLABS_VOICE_ID", "voice_example");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.auth.mockResolvedValue({ user: { userId: "user-a" } });
  mocks.limit.mockResolvedValue(undefined);
  mocks.fetch.mockResolvedValue(
    new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "audio/mpeg" } }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("Mia ElevenLabs speech endpoint", () => {
  it("sends only bounded reply text to the configured voice and returns private audio", async () => {
    const response = await post(request({ text: "Turn down the heat." }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(mocks.limit).toHaveBeenCalledWith("mia_speech", "user-a", 12);
    const [url, init] = mocks.fetch.mock.calls[0];
    expect(url).toBe(
      "https://api.elevenlabs.io/v1/text-to-speech/voice_example?output_format=mp3_44100_128",
    );
    expect(init.headers["xi-api-key"]).toBe("synthetic-test-key");
    expect(JSON.parse(init.body)).toEqual({
      text: "Turn down the heat.",
      model_id: "eleven_multilingual_v2",
    });
  });
  it("denies unauthenticated users before provider traffic", async () => {
    mocks.auth.mockResolvedValue({
      response: Response.json({ error: "Sign in" }, { status: 401 }),
    });
    expect((await post(request({ text: "Hello" }))).status).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("rejects arbitrary extra fields and excessive text before provider traffic", async () => {
    expect((await post(request({ text: "x".repeat(4001) }))).status).toBe(400);
    expect((await post(request({ text: "hello", voiceId: "other" }))).status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("returns a clear configuration error without sending a request", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    expect((await post(request({ text: "hello" }))).status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("enforces rate limits and never exposes provider error details", async () => {
    mocks.limit.mockRejectedValueOnce(new Response("rate limit", { status: 429 }));
    expect((await post(request({ text: "hello" }))).status).toBe(429);
    expect(mocks.fetch).not.toHaveBeenCalled();
    mocks.fetch.mockResolvedValueOnce(new Response("private-provider-details", { status: 401 }));
    const response = await post(request({ text: "hello" }));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("private-provider-details");
  });
  it("rejects non-audio, empty and oversized provider responses", async () => {
    mocks.fetch.mockResolvedValueOnce(
      new Response("oops", { headers: { "content-type": "text/html" } }),
    );
    expect((await post(request({ text: "hello" }))).status).toBe(502);
    mocks.fetch.mockResolvedValueOnce(
      new Response(null, { headers: { "content-type": "audio/mpeg" } }),
    );
    expect((await post(request({ text: "hello" }))).status).toBe(502);
    mocks.fetch.mockResolvedValueOnce(
      new Response(new Uint8Array(11 * 1024 * 1024), { headers: { "content-type": "audio/mpeg" } }),
    );
    expect((await post(request({ text: "hello" }))).status).toBe(502);
  });
  it("cancels the ElevenLabs request when the caller disconnects", async () => {
    mocks.fetch.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const controller = new AbortController();
    const pending = post({
      request: new Request("https://example.test/api/mia-speech", {
        method: "POST",
        body: JSON.stringify({ text: "Hello" }),
        signal: controller.signal,
      }),
    });
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());
    controller.abort();
    expect((await pending).status).toBe(499);
  });
});
