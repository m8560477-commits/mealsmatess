import type { MiaMicrophone, MicrophoneEvents } from "./microphone";

export type MiaVoiceState =
  | "muted"
  | "loading"
  | "waiting"
  | "listening"
  | "thinking"
  | "speaking"
  | "paused"
  | "denied"
  | "error";
export type MiaVoiceSnapshot = { state: MiaVoiceState; transcript: string; error: string };
type Dependencies = {
  microphone: (events: MicrophoneEvents, signal: AbortSignal) => Promise<MiaMicrophone>;
  respond: (text: string, signal: AbortSignal) => Promise<string>;
  speak: (text: string, signal: AbortSignal) => Promise<void>;
  changed: (value: MiaVoiceSnapshot) => void;
};
const WAKE = /\bhey\s+(?:mia|me\s+a)\b[,.!?\s]*/i;
export function afterMiaWake(text: string): string | null {
  const match = WAKE.exec(text);
  return match ? text.slice(match.index + match[0].length).trim() : null;
}
const normal = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function isReplyEcho(text: string, reply: string) {
  const candidate = normal(text);
  const spoken = normal(reply);
  if (spoken.includes(candidate)) return true;
  const words = candidate.split(" ");
  const vocabulary = new Set(spoken.split(" "));
  return (
    words.length >= 4 && words.filter((word) => vocabulary.has(word)).length / words.length >= 0.75
  );
}

/** One opt-in foreground session. The only network boundary is respond(), after activation. */
export class MiaVoiceSession {
  private snapshot: MiaVoiceSnapshot = { state: "muted", transcript: "", error: "" };
  private lifetime?: AbortController;
  private output?: AbortController;
  private mic?: MiaMicrophone;
  private silence?: ReturnType<typeof setTimeout>;
  private idle?: ReturnType<typeof setTimeout>;
  private maxTurn?: ReturnType<typeof setTimeout>;
  private finalizing = false;
  private spoken = "";
  constructor(private dependencies: Dependencies) {}

  private change(state: MiaVoiceState, transcript = "", error = "") {
    if (
      this.snapshot.state === state &&
      this.snapshot.transcript === transcript &&
      this.snapshot.error === error
    )
      return;
    this.snapshot = { state, transcript, error };
    this.dependencies.changed(this.snapshot);
  }
  private clearTimers() {
    clearTimeout(this.silence);
    clearTimeout(this.idle);
    clearTimeout(this.maxTurn);
  }
  stop(state: MiaVoiceState = "muted", error = "") {
    this.clearTimers();
    this.lifetime?.abort();
    this.output?.abort();
    this.mic?.dispose();
    this.mic = undefined;
    this.finalizing = false;
    this.change(state, "", error);
  }
  async start() {
    this.stop();
    const lifetime = new AbortController();
    this.lifetime = lifetime;
    this.change("loading");
    try {
      const mic = await this.dependencies.microphone(
        {
          transcript: (text, endpoint) => {
            if (!lifetime.signal.aborted) this.heard(text, endpoint);
          },
          activity: () => {
            if (
              !lifetime.signal.aborted &&
              this.snapshot.state === "listening" &&
              this.snapshot.transcript
            ) {
              this.scheduleFinish();
            }
          },
          failed: (error) => {
            if (!lifetime.signal.aborted) this.stop("error", error.message);
          },
        },
        lifetime.signal,
      );
      if (lifetime.signal.aborted) {
        mic.dispose();
        return;
      }
      this.mic = mic;
      this.wait();
    } catch (error) {
      if (lifetime.signal.aborted) return;
      this.stop(
        error instanceof DOMException && error.name === "NotAllowedError" ? "denied" : "error",
        error instanceof Error || error instanceof DOMException
          ? error.message
          : "Couldn't start the microphone.",
      );
    }
  }
  private wait(error = "") {
    this.clearTimers();
    this.mic?.reset("wake");
    this.finalizing = false;
    this.change("waiting", "", error);
  }
  private listen() {
    this.clearTimers();
    this.change("listening");
    this.idle = setTimeout(() => this.wait(), 25_000);
    this.maxTurn = setTimeout(() => void this.finish(), 30_000);
  }
  private scheduleFinish() {
    clearTimeout(this.silence);
    this.silence = setTimeout(() => void this.finish(), 1200);
  }
  private heard(text: string, endpoint: boolean) {
    if (this.finalizing) return;
    const wakeText = afterMiaWake(text);
    if (this.snapshot.state === "waiting") {
      if (wakeText === null) {
        // Discard unrelated speech after each local endpoint; never retain or transmit it.
        if (endpoint || text.length > 1000) this.mic?.reset("wake");
        return;
      }
      this.listen();
    } else if (this.snapshot.state === "speaking") {
      const candidate = normal(text);
      // AEC is enabled; also suppress recognition of Mia's own spoken words.
      if (!candidate || (wakeText === null && isReplyEcho(candidate, this.spoken))) return;
      this.output?.abort();
      this.listen();
    }
    if (this.snapshot.state !== "listening") return;
    const question = wakeText ?? text;
    this.change("listening", question.slice(0, 4000));
    if (question.trim()) {
      clearTimeout(this.idle);
      this.scheduleFinish();
    }
  }
  private async finish() {
    if (this.snapshot.state !== "listening" || this.finalizing || !this.mic || !this.lifetime)
      return;
    this.finalizing = true;
    const lifetime = this.lifetime;
    const raw = await this.mic.finish();
    if (lifetime.signal.aborted) return;
    this.finalizing = false;
    const text = (afterMiaWake(raw) ?? raw).trim().slice(0, 4000);
    if (!text) {
      this.wait();
      return;
    }
    if (/^(mute mia|microphone off|mute microphone|stop listening)[.!]?$/i.test(text)) {
      this.stop();
      return;
    }
    if (
      /^(thanks(?: mia)?|thank you(?: mia)?|goodbye(?: mia)?|that'?s all|end conversation)[.!]?$/i.test(
        text,
      )
    ) {
      this.wait();
      return;
    }
    this.clearTimers();
    this.mic.reset("ignore");
    this.change("thinking", text);
    const output = new AbortController();
    this.output = output;
    try {
      const answer = await this.dependencies.respond(text, output.signal);
      if (lifetime.signal.aborted || output.signal.aborted) return;
      this.mic?.reset();
      this.spoken = answer;
      this.change("speaking");
      await this.dependencies.speak(answer, output.signal);
      if (lifetime.signal.aborted || output.signal.aborted) return;
      this.mic?.reset();
      this.listen();
    } catch (error) {
      if (lifetime.signal.aborted || output.signal.aborted) return;
      this.wait(
        error instanceof Error ? error.message : "Mia couldn't respond. Try again after Hey Mia.",
      );
    }
  }
  endConversation() {
    this.output?.abort();
    if (this.mic) this.wait();
  }
}
