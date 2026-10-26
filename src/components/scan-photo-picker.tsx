import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function cameraError(error: unknown) {
  const name = typeof error === "object" && error !== null && "name" in error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera access is blocked. Allow camera access in your browser settings, or choose a photo instead.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera was found. Connect a camera or choose a photo instead.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "The camera is busy. Close other apps using it and try again, or choose a photo.";
  }
  return "Couldn't open the camera. Try again or choose a photo instead.";
}

/** Native apps use the system camera picker; browsers get a live, silent preview. */
export function ScanPhotoPicker({
  disabled,
  onPhoto,
}: {
  disabled: boolean;
  onPhoto: (file: File) => void;
}) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  function selected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file && !disabled) onPhoto(file);
  }

  return (
    <>
      <input
        ref={cameraInput}
        type="file"
        aria-label="Take a food photo"
        accept="image/*"
        capture="environment"
        disabled={disabled}
        className="hidden"
        onChange={selected}
      />
      <input
        ref={galleryInput}
        type="file"
        aria-label="Choose a food photo"
        accept="image/jpeg,image/png,image/webp,image/gif"
        disabled={disabled}
        className="hidden"
        onChange={selected}
      />
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <Button
          disabled={disabled}
          onClick={() => {
            if (
              Capacitor.isNativePlatform() ||
              !window.isSecureContext ||
              !navigator.mediaDevices?.getUserMedia
            ) {
              cameraInput.current?.click();
            } else {
              setOpen(true);
            }
          }}
        >
          <Camera className="mr-2 h-4 w-4" /> Take photo
        </Button>
        <Button variant="outline" disabled={disabled} onClick={() => galleryInput.current?.click()}>
          <ImagePlus className="mr-2 h-4 w-4" /> Choose photo
        </Button>
      </div>
      {open && !disabled && (
        <CameraCapture
          onClose={close}
          onPhoto={(file) => {
            close();
            onPhoto(file);
          }}
          onChoose={() => {
            close();
            galleryInput.current?.click();
          }}
        />
      )}
    </>
  );
}

function CameraCapture({
  onClose,
  onPhoto,
  onChoose,
}: {
  onClose: () => void;
  onPhoto: (file: File) => void;
  onChoose: () => void;
}) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const active = useRef(false);
  const capturing = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taking, setTaking] = useState(false);

  useEffect(() => {
    if (!video) return;
    let cancelled = false;
    let stream: MediaStream | undefined;
    active.current = true;
    setReady(false);
    setError(null);
    const element = video;
    void navigator.mediaDevices
      .getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" } } })
      .then(async (result) => {
        if (cancelled) {
          result.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = result;
        if (element) {
          element.srcObject = result;
          await element.play();
        }
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        stream?.getTracks().forEach((track) => track.stop());
        setReady(false);
        setError(cameraError(reason));
      });
    function hidden() {
      if (document.visibilityState === "hidden") onClose();
    }
    document.addEventListener("visibilitychange", hidden);
    return () => {
      cancelled = true;
      active.current = false;
      stream?.getTracks().forEach((track) => track.stop());
      if (element) element.srcObject = null;
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [attempt, onClose, video]);

  function capture() {
    const element = video;
    if (!element || !ready || capturing.current) return;
    capturing.current = true;
    setTaking(true);
    try {
      if (!element.videoWidth || !element.videoHeight) throw new Error("Camera is not ready.");
      const scale = Math.min(1, 1024 / Math.max(element.videoWidth, element.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(element.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(element.videoHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Photo processing is unavailable.");
      context.drawImage(element, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!active.current) return;
          capturing.current = false;
          setTaking(false);
          if (!blob) {
            setError("Couldn't capture a photo. Try again or choose a photo instead.");
            return;
          }
          onPhoto(new File([blob], "food-camera.jpg", { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.85,
      );
    } catch {
      capturing.current = false;
      setTaking(false);
      setError("Couldn't capture a photo. Try again or choose a photo instead.");
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>Take a food photo</DialogTitle>
          <DialogDescription>Keep your food in view, then take the photo.</DialogDescription>
        </DialogHeader>
        <div className="relative overflow-hidden rounded-xl bg-black">
          <video
            ref={setVideo}
            autoPlay
            playsInline
            muted
            aria-label="Food camera preview"
            className="aspect-[4/3] max-h-[45dvh] w-full object-contain"
            onCanPlay={() => setReady(true)}
          />
          {!ready && !error && (
            <p
              role="status"
              className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white"
            >
              <Loader2 className="size-4 animate-spin" /> Opening camera…
            </p>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!ready || taking} onClick={capture}>
            <Camera className="mr-2 size-4" />
            {taking ? "Taking photo…" : "Use photo"}
          </Button>
          {error && (
            <Button
              variant="outline"
              disabled={taking}
              onClick={() => setAttempt((value) => value + 1)}
            >
              Try camera again
            </Button>
          )}
          <Button variant="outline" onClick={onChoose}>
            Choose photo instead
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
