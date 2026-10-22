import { waitForFirebaseAuth } from "@/lib/firebase";
import {
  ScanEventSchema,
  ScanInputSchema,
  type ScanEvent,
  type ScanInput,
  type ScanResult,
} from "@/lib/scanner";

export async function readScanStream(
  response: Response,
  onEvent: (event: ScanEvent) => void,
  signal: AbortSignal,
): Promise<ScanResult> {
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      typeof data?.error === "string" ? data.error : "The scan could not start. Please try again.",
    );
  }
  if (!response.headers.get("content-type")?.includes("application/x-ndjson") || !response.body)
    throw new Error("The scanner returned an unsupported response.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let bytes = 0;
  let result: ScanResult | undefined;
  const consume = (line: string) => {
    if (!line.trim()) return;
    let event: ScanEvent;
    try {
      event = ScanEventSchema.parse(JSON.parse(line));
    } catch {
      throw new Error("The scanner returned invalid data. Please retry.");
    }
    if (event.type === "error") throw new Error(event.message);
    if (result) throw new Error("The scanner returned data after its final result.");
    onEvent(event);
    if (event.type === "result") result = event.result;
  };
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 500_000) throw new Error("The scanner returned too much data.");
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop()!;
      lines.forEach(consume);
    }
    consume(pending + decoder.decode());
    if (!result) throw new Error("The scan connection ended before results arrived. Please retry.");
    return result;
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** Also bounds auth/token waiting, so cancelling cannot start a delayed upload. */
export function withScanAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export async function requestScan(
  input: ScanInput,
  onEvent: (event: ScanEvent) => void,
  cancelSignal: AbortSignal,
) {
  const signal = AbortSignal.any([cancelSignal, AbortSignal.timeout(60_000)]);
  try {
    if (!navigator.onLine)
      throw new Error("You're offline. Keep your capture and reconnect to analyze it.");
    const user = await withScanAbort(waitForFirebaseAuth(), signal);
    if (!user) throw new Error("Sign in to use the MealMate scanner.");
    const token = await withScanAbort(user.getIdToken(), signal);
    signal.throwIfAborted();
    const response = await fetch("/api/scan", {
      method: "POST",
      signal,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(ScanInputSchema.parse(input)),
    });
    return await readScanStream(response, onEvent, signal);
  } catch (error) {
    if (signal.aborted) {
      if (cancelSignal.aborted) throw cancelSignal.reason;
      throw new Error("The scan timed out. Your capture is kept so you can retry.");
    }
    if (error instanceof TypeError)
      throw new Error("The scan connection failed. Check your internet connection and retry.");
    if (error instanceof Error && error.name === "ZodError")
      throw new Error("The scanner returned invalid data. Please retry.");
    throw error;
  }
}
