import { Capacitor } from "@capacitor/core";
import { LocalRecognizer, type RecognitionMode } from "./local-recognizer";

export interface MiaMicrophone {
  reset(mode?: RecognitionMode): void;
  finish(): Promise<string>;
  dispose(): void;
}
export type MicrophoneEvents = {
  transcript: (text: string, endpoint: boolean) => void;
  activity: () => void;
  failed: (error: Error) => void;
  needsGesture?: () => void;
};

export async function openMiaMicrophone(
  events: MicrophoneEvents,
  signal: AbortSignal,
): Promise<MiaMicrophone> {
  if (Capacitor.isNativePlatform() && !Capacitor.isPluginAvailable("App")) {
    throw new Error("Update the MealMate Android app to enable hands-free Mia.");
  }
  if (
    !window.isSecureContext ||
    !navigator.mediaDevices?.getUserMedia ||
    !window.AudioWorkletNode
  ) {
    throw new Error(
      "Hands-free Mia needs HTTPS and a browser with microphone and AudioWorklet support.",
    );
  }
  // Ask the platform for permission before waiting for audio playback restrictions.
  const context = new AudioContext({ sampleRate: 16000 });
  let stream: MediaStream | undefined;
  let decoder: LocalRecognizer | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let processor: AudioWorkletNode | undefined;
  let disposed = false;
  const loading = new AbortController();
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    loading.abort();
    signal.removeEventListener("abort", dispose);
    stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    if (processor) processor.port.onmessage = null;
    source?.disconnect();
    processor?.disconnect();
    decoder?.dispose();
    context.onstatechange = null;
    void context.close().catch(() => undefined);
  };
  signal.addEventListener("abort", dispose, { once: true });
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    if (signal.aborted) {
      stream.getTracks().forEach((track) => track.stop());
      signal.throwIfAborted();
    }
    // Load the local decoder and worklet while waiting for a playback gesture.
    // The worker is still started only after microphone permission is granted.
    const decoderReady = LocalRecognizer.load(
      context.sampleRate,
      events.transcript,
      loading.signal,
      events.failed,
    ).then((value) => {
      if (disposed || signal.aborted) {
        value.dispose();
        throw new DOMException("Voice stopped", "AbortError");
      }
      decoder = value;
    });
    const workletReady = Promise.resolve().then(() =>
      context.audioWorklet.addModule("/mia/pcm-worklet.js"),
    );
    const audioReady = new Promise<void>((resolve, reject) => {
      let done = false;
      const cleanup = () => {
        clearTimeout(notice);
        loading.signal.removeEventListener("abort", aborted);
        window.removeEventListener("pointerdown", attempt);
        window.removeEventListener("keydown", attempt);
      };
      const finish = (error?: unknown) => {
        if (done) return;
        done = true;
        cleanup();
        if (error) reject(error);
        else resolve();
      };
      const aborted = () => finish(new DOMException("Voice stopped", "AbortError"));
      const attempt = () => {
        void context
          .resume()
          .then(() => {
            if (context.state === "running") finish();
          })
          .catch((error: unknown) => {
            if (!(error instanceof DOMException && error.name === "NotAllowedError")) finish(error);
          });
      };
      const notice = setTimeout(() => {
        if (!done) events.needsGesture?.();
      }, 1000);
      loading.signal.addEventListener("abort", aborted, { once: true });
      window.addEventListener("pointerdown", attempt);
      window.addEventListener("keydown", attempt);
      if (loading.signal.aborted) aborted();
      else attempt();
    });
    await Promise.all([decoderReady, workletReady, audioReady]);
    signal.throwIfAborted();
    stream.getAudioTracks().forEach((track) => {
      track.onended = () =>
        events.failed(new Error("Microphone access ended. Enable hands-free again to reconnect."));
    });
    source = context.createMediaStreamSource(stream);
    processor = new AudioWorkletNode(context, "mia-pcm");
    processor.port.onmessage = ({ data }: MessageEvent<Float32Array>) => {
      if (disposed || signal.aborted) return;
      const rms = Math.sqrt(data.reduce((sum, sample) => sum + sample * sample, 0) / data.length);
      if (rms > 0.012) events.activity();
      decoder?.accept(data);
    };
    // The worklet writes silence; connecting it keeps processing alive without mic playback.
    source.connect(processor);
    processor.connect(context.destination);
    context.onstatechange = () => {
      if (!disposed && context.state !== "running") {
        events.failed(new Error("Audio was suspended. Resume hands-free when MealMate is active."));
      }
    };
    return { reset: (mode) => decoder?.reset(mode), finish: () => decoder!.finish(), dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
