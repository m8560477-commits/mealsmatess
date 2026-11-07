import { waitForFirebaseAuth } from "@/lib/firebase-core";

import { readJsonLines } from "@/lib/json-lines";

type ApiResponse = { error?: string } & Record<string, unknown>;

export async function postAuthenticatedAi<T>(
  path: "/api/mia" | "/api/recipe-image",
  body: unknown,
  {
    timeoutMs = 45_000,
    signal,
    onText,
  }: { timeoutMs?: number; signal?: AbortSignal; onText?: (text: string) => void } = {},
): Promise<T> {
  signal?.throwIfAborted();
  const user = await waitForFirebaseAuth();
  if (!user) throw new Error("Sign in to use MealMate AI.");
  const token = await user.getIdToken();
  signal?.throwIfAborted();

  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (signal?.aborted) throw new DOMException("Request interrupted", "AbortError");
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("The AI request timed out. Please try again.");
    }
    throw new Error("The AI service is temporarily unavailable. Please try again.");
  }

  if (response.ok && response.headers.get("content-type")?.includes("application/x-ndjson")) {
    if (!response.body) throw new Error("Mia returned an empty response. Please try again.");
    let reply = "";
    let complete = false;
    for await (const raw of readJsonLines(response.body)) {
      signal?.throwIfAborted();
      const event = raw as { type?: string; text?: unknown; error?: unknown };
      if (event.type === "error")
        throw new Error(
          typeof event.error === "string" ? event.error : "Mia couldn't complete that response.",
        );
      if (event.type === "text" && typeof event.text === "string") {
        reply += event.text;
        onText?.(reply);
      }
      if (event.type === "done") {
        complete = true;
        break;
      }
    }
    if (!complete || !reply.trim())
      throw new Error("Mia's response was interrupted. Please try again.");
    return { reply } as T;
  }
  const data = (await response.json().catch(() => null)) as ApiResponse | null;
  if (!response.ok) {
    throw new Error(
      typeof data?.error === "string" ? data.error : "The AI request could not be completed.",
    );
  }
  if (!data) throw new Error("The AI service returned an invalid response. Please try again.");
  return data as T;
}
