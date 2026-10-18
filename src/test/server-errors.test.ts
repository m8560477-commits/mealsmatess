import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeCatastrophicSsrResponse } from "@/server";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("server error response normalization", () => {
  it("preserves JSON errors for server-function requests", async () => {
    const body = { unhandled: true, message: "HTTPError" };
    const request = new Request("http://localhost/", {
      method: "POST",
      headers: { accept: "application/json" },
    });
    const response = Response.json(body, { status: 500 });

    const normalized = await normalizeCatastrophicSsrResponse(response, request);

    expect(normalized.status).toBe(500);
    expect(normalized.headers.get("content-type")).toContain("application/json");
    await expect(normalized.json()).resolves.toEqual(body);
  });

  it("renders catastrophic HTML only for browser document requests", async () => {
    const request = new Request("http://localhost/", {
      method: "GET",
      headers: { accept: "text/html" },
    });
    const response = Response.json({ unhandled: true, message: "HTTPError" }, { status: 500 });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const normalized = await normalizeCatastrophicSsrResponse(response, request);

    expect(normalized.status).toBe(500);
    expect(normalized.headers.get("content-type")).toContain("text/html");
    expect(await normalized.text()).toMatch(/<html/i);
  });
});
