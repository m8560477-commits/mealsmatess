import { waitForFirebaseAuth } from "@/lib/firebase";

/** Play server-generated ElevenLabs audio. Mute and interruption cancel both fetch and playback. */
export async function speakMia(text: string, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const user = await waitForFirebaseAuth();
  if (!user) throw new Error("Sign in to hear Mia.");
  const token = await user.getIdToken();
  signal.throwIfAborted();
  let response: Response;
  try {
    response = await fetch("/api/mia-speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.replace(/[*#`]/g, "").slice(0, 4000) }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(55_000)]),
    });
  } catch {
    if (signal.aborted) throw new DOMException("Speech interrupted", "AbortError");
    throw new Error("Mia's voice is temporarily unavailable. You can read the reply in chat.");
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: unknown } | null;
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "Mia's voice is unavailable. You can read the reply in chat.",
    );
  }
  if (!response.headers.get("content-type")?.toLowerCase().startsWith("audio/"))
    throw new Error("Mia's voice response was invalid.");
  const blob = await response.blob();
  signal.throwIfAborted();
  if (!blob.size || blob.size > 10 * 1024 * 1024)
    throw new Error("Mia's voice response was invalid.");
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
    const finish = (failure?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (failure) reject(failure);
      else resolve();
    };
    const abort = () => finish(new DOMException("Speech interrupted", "AbortError"));
    const timer = setTimeout(
      () => finish(new Error("Mia's voice stopped responding. You can read the reply in chat.")),
      120_000,
    );
    audio.onended = () => finish();
    audio.onerror = () =>
      finish(new Error("Couldn't play Mia's voice. You can read the reply in chat."));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    void audio
      .play()
      .catch(() => finish(new Error("Tap the screen to allow audio, then try Mia again.")));
  });
}
