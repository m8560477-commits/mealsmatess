import { useCallback, useEffect, useRef, useState } from "react";
import { cameraError } from "@/lib/scanner-camera";

export function useScannerCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const [state, setState] = useState<"idle" | "requesting" | "live" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torch, setTorch] = useState(false);

  const stop = useCallback(() => {
    generation.current++;
    streamRef.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setState("idle");
    setTorch(false);
    setTorchAvailable(false);
  }, []);

  const start = useCallback(async () => {
    stop();
    setError(null);
    setState("requesting");
    const run = generation.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Live camera needs a secure HTTPS connection and a supported browser. You can choose a photo instead.",
        );
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "Camera access is taking too long. Check permission, then retry or choose a photo.",
              ),
            ),
          15_000,
        );
      });
      const permission = navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      // A permission prompt may resolve after cancel, timeout, unmount or a newer request.
      void permission.then(
        (stream) => {
          if (generation.current !== run) stream.getTracks().forEach((track) => track.stop());
        },
        () => undefined,
      );
      const stream = await Promise.race([permission, timeout]);
      if (generation.current !== run) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("Camera preview is unavailable. Please retry.");
      video.srcObject = stream;
      await Promise.race([video.play(), timeout]);
      if (generation.current !== run) return;
      const track = stream.getVideoTracks()[0];
      if (!track || !video.videoWidth)
        throw new Error("No camera image was received. Please retry.");
      track.onended = () => {
        stop();
        setError("Camera access ended. Tap Open camera to resume.");
      };
      const capabilities = track.getCapabilities?.() as
        (MediaTrackCapabilities & { torch?: boolean }) | undefined;
      setTorchAvailable(capabilities?.torch === true);
      setState("live");
    } catch (err) {
      if (generation.current !== run) return;
      stop();
      setError(cameraError(err));
      setState("error");
    } finally {
      clearTimeout(timer);
    }
  }, [stop]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchAvailable) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      setError("The flashlight could not be changed on this camera.");
    }
  }, [torch, torchAvailable]);

  useEffect(() => {
    const onHide = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", stop);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", stop);
      stop();
    };
  }, [stop]);

  return { videoRef, state, error, torchAvailable, torch, start, stop, toggleTorch };
}
