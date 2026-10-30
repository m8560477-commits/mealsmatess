import { Capacitor, registerPlugin } from "@capacitor/core";
import type { TextToSpeechPlugin } from "@capacitor-community/text-to-speech";

// Register only the native bridge. The package's web implementation touches
// window during module loading, including in the server-rendered bundle.
// Browser replies use speakBrowser instead.

/** Device TTS, preferring a local English voice. No microphone data is passed to TTS. */
function speakBrowser(text: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!("speechSynthesis" in window)) {
      reject(
        new Error("Spoken replies aren't available on this device. Mia's answer is shown in chat."),
      );
      return;
    }
    signal.throwIfAborted();
    const synth = window.speechSynthesis;
    const chunks = text.replace(/[*#`]/g, "").match(/.{1,180}(?:\s|$)|\S{1,180}/g) ?? [];
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      synth.cancel();
      reject(new DOMException("Speech interrupted", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    const next = () => {
      if (signal.aborted) return;
      const chunk = chunks.shift();
      if (!chunk) {
        cleanup();
        resolve();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(chunk);
      const voices = synth.getVoices().filter((voice) => voice.lang.startsWith("en"));
      utterance.voice = voices.find((voice) => voice.localService) ?? voices[0] ?? null;
      utterance.lang = "en-US";
      utterance.rate = 1;
      utterance.onend = next;
      utterance.onerror = () => {
        cleanup();
        reject(new Error("Couldn't speak the reply. You can read it in Mia chat."));
      };
      clearTimeout(timer);
      timer = setTimeout(() => {
        cleanup();
        synth.cancel();
        reject(new Error("Device speech stopped responding. You can read Mia's answer in chat."));
      }, 35_000);
      synth.speak(utterance);
    };
    next();
  });
}

export async function speakMia(text: string, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  if (!Capacitor.isNativePlatform()) return speakBrowser(text, signal);
  if (!Capacitor.isPluginAvailable("TextToSpeech")) {
    throw new Error("Update the MealMate Android app to enable spoken Mia replies.");
  }
  const TextToSpeech = registerPlugin<TextToSpeechPlugin>("TextToSpeech");
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      void TextToSpeech.stop().catch(() => undefined);
      reject(new DOMException("Speech interrupted", "AbortError"));
    };
    const timeout = setTimeout(() => {
      cleanup();
      void TextToSpeech.stop().catch(() => undefined);
      reject(new Error("Device speech stopped responding. You can read Mia's answer in chat."));
    }, 120_000);
    signal.addEventListener("abort", abort, { once: true });
    void TextToSpeech.speak({
      text: text.replace(/[*#`]/g, ""),
      lang: "en-US",
      rate: 1,
      pitch: 1,
      volume: 1,
    }).then(
      () => {
        cleanup();
        resolve();
      },
      () => {
        cleanup();
        reject(
          new Error(
            "Couldn't speak the reply. Check that an English voice is installed in Android speech settings.",
          ),
        );
      },
    );
  });
}
