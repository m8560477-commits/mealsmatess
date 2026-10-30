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
};

export async function openMiaMicrophone(
  events: MicrophoneEvents,
  signal: AbortSignal,
): Promise<MiaMicrophone> {
  if (
    Capacitor.isNativePlatform() &&
    (!Capacitor.isPluginAvailable("App") || !Capacitor.isPluginAvailable("TextToSpeech"))
  ) {
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
  // Construct/resume from the user's enable gesture, before asynchronous model loading.
  const context = new AudioContext({ sampleRate: 16000 });
  let stream: MediaStream | undefined;
  let decoder: LocalRecognizer | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let processor: AudioWorkletNode | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
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
    await context.resume();
    signal.throwIfAborted();
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
    stream.getAudioTracks().forEach((track) => {
      track.onended = () =>
        events.failed(new Error("Microphone access ended. Enable hands-free again to reconnect."));
    });
    decoder = await LocalRecognizer.load(
      context.sampleRate,
      events.transcript,
      signal,
      events.failed,
    );
    if (signal.aborted) {
      decoder.dispose();
      signal.throwIfAborted();
    }
    await context.audioWorklet.addModule("/mia/pcm-worklet.js");
    signal.throwIfAborted();
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
