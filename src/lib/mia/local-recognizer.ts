import type { KaldiRecognizer, Model } from "vosk-browser";

// Pinned vosk-browser's public terminate sends a worker message. Direct termination
// also covers cancellation before its asynchronous model load has completed.
function terminateModel(model: Model) {
  model.terminate();
  (model as unknown as { worker: Worker }).worker.terminate();
}
export const MIA_MODEL_URL = "/mia/vosk-model-small-en-us-0.15.tar.gz";
export type RecognitionMode = "wake" | "conversation" | "ignore";

/** Local constrained wake detector; full English decoding starts only after activation. */
export class LocalRecognizer {
  private recognizer?: KaldiRecognizer;
  private segments: string[] = [];
  private partial = "";
  private finishing?: (text: string) => void;
  private finishTimer?: ReturnType<typeof setTimeout>;
  private mode: RecognitionMode = "wake";
  private samples = 0;
  private ring: { start: number; data: Float32Array }[] = [];
  private waking = false;

  private constructor(
    private model: Model,
    private rate: number,
    private transcript: (text: string, endpoint: boolean) => void,
  ) {
    this.reset("wake");
  }

  static async load(
    rate: number,
    transcript: (text: string, endpoint: boolean) => void,
    signal: AbortSignal,
    onError: (error: Error) => void,
  ) {
    const { Model } = await import("vosk-browser");
    signal.throwIfAborted();
    const model = new Model(new URL(MIA_MODEL_URL, location.origin).href, -2);
    const worker = (model as unknown as { worker: Worker }).worker;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => fail(new Error("The voice model took too long to load.")),
        120_000,
      );
      const cleanup = () => {
        clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
      };
      const fail = (error: Error) => {
        cleanup();
        terminateModel(model);
        reject(error);
      };
      const abort = () => fail(new DOMException("Voice stopped", "AbortError"));
      signal.addEventListener("abort", abort, { once: true });
      model.on("load", (message) => {
        if ("result" in message && message.result) {
          cleanup();
          resolve();
        } else fail(new Error("Couldn't load the offline voice model."));
      });
      const failed = () => {
        const error = new Error("Local speech recognition failed. Please enable hands-free again.");
        if (!model.ready) fail(error);
        else onError(error);
      };
      model.on("error", failed);
      worker.addEventListener("error", failed);
    });
    if (signal.aborted) {
      terminateModel(model);
      signal.throwIfAborted();
    }
    return new LocalRecognizer(model, rate, transcript);
  }

  private text() {
    return [...this.segments, this.partial].filter(Boolean).join(" ").trim();
  }

  reset(mode: RecognitionMode = "conversation") {
    clearTimeout(this.finishTimer);
    this.finishing?.("");
    this.finishing = undefined;
    this.recognizer?.remove();
    this.recognizer = undefined;
    this.segments = [];
    this.partial = "";
    this.mode = mode;
    this.samples = 0;
    this.ring = [];
    this.waking = false;
    if (mode === "ignore") return;
    const recognizer = new this.model.KaldiRecognizer(
      this.rate,
      mode === "wake" ? JSON.stringify(["hey mia", "hey me a", "[unk]"]) : undefined,
    );
    this.recognizer = recognizer;
    recognizer.setWords(true);
    recognizer.on("partialresult", (message) => {
      if (!("result" in message) || !("partial" in message.result)) return;
      const text = message.result.partial;
      if (this.mode === "wake") {
        if (!this.waking && /\bhey (mia|me a)\b/.test(text)) {
          this.waking = true;
          // Resolve the wake word's acoustic end timestamp, preserving trailing question audio.
          recognizer.retrieveFinalResult();
          this.transcript("hey mia", false);
        }
      } else {
        this.partial = text;
        this.transcript(this.text(), false);
      }
    });
    recognizer.on("result", (message) => {
      if (!("result" in message) || !("text" in message.result)) return;
      if (this.mode === "wake") {
        const words = message.result.result ?? [];
        const wakeEnd = words
          .filter((word) => word.word === "mia" || word.word === "a")
          .at(-1)?.end;
        if (
          (this.waking || /\bhey (mia|me a)\b/.test(message.result.text)) &&
          wakeEnd !== undefined
        ) {
          const buffered = this.ring;
          const cut = Math.round(wakeEnd * this.rate);
          if (!this.waking) this.transcript("hey mia", false);
          this.reset("conversation");
          for (const { start, data } of buffered) {
            if (start + data.length > cut) this.accept(data.slice(Math.max(0, cut - start)));
          }
        } else if (!this.waking) {
          // Discard non-wake speech locally at its endpoint.
          this.reset("wake");
        }
        return;
      }
      if (message.result.text) this.segments.push(message.result.text);
      this.partial = "";
      if (this.finishing) {
        clearTimeout(this.finishTimer);
        const done = this.finishing;
        this.finishing = undefined;
        done(this.text());
      } else this.transcript(this.text(), true);
    });
  }

  accept(samples: Float32Array) {
    if (this.mode === "ignore") return;
    if (this.mode === "wake") {
      this.ring.push({ start: this.samples, data: samples.slice() });
      this.samples += samples.length;
      while (this.ring.length > 1 && this.ring[0]!.start < this.samples - this.rate * 4)
        this.ring.shift();
      if (this.waking) return;
    }
    this.recognizer?.acceptWaveformFloat(samples, this.rate);
  }

  finish(): Promise<string> {
    return new Promise((resolve) => {
      this.finishing = resolve;
      this.finishTimer = setTimeout(() => {
        this.finishing = undefined;
        resolve(this.text());
      }, 5000);
      this.recognizer?.retrieveFinalResult();
    });
  }
  dispose() {
    clearTimeout(this.finishTimer);
    this.finishing?.("");
    this.finishing = undefined;
    this.recognizer?.remove();
    terminateModel(this.model);
  }
}
