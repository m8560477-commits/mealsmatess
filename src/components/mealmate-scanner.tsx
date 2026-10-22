import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  Flashlight,
  ImagePlus,
  Loader2,
  ScanLine,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChefMascot } from "@/components/chef-mascot";
import { ScannerAnalysis } from "@/components/scanner-analysis";
import { ScannerResults } from "@/components/scanner-results";
import { useScannerCamera } from "@/hooks/use-scanner-camera";
import {
  captureScanImage,
  createProductDetector,
  detectScanImage,
  prepareScanFile,
  type ProductDetector,
} from "@/lib/scanner-camera";
import { requestScan, withScanAbort } from "@/lib/scanner-client";
import {
  initialScanProgress,
  productCode,
  type ScanInput,
  type ScanMode,
  type ScanProgress,
  type ScanResult,
} from "@/lib/scanner";

type Phase = "capture" | "analyzing" | "result" | "error";
const MODES = [
  { id: "dish", label: "Food" },
  { id: "ingredients", label: "Ingredients" },
  { id: "recipe", label: "Recipe" },
  { id: "barcode", label: "Barcode" },
] as const;

export function MealMateScanner({
  initialMode = "dish",
  onCancel,
}: {
  initialMode?: ScanMode;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState(initialMode);
  const [phase, setPhase] = useState<Phase>("capture");
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<ScanProgress>(initialScanProgress);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [barcode, setBarcode] = useState("");
  const [barcodeHint, setBarcodeHint] = useState("");
  const [detector, setDetector] = useState<ProductDetector | null>(null);
  const [offline, setOffline] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const active = useRef<AbortController | null>(null);
  const lastSource = useRef<File | ScanInput | null>(null);
  const camera = useScannerCamera();
  const { stop, videoRef, state: cameraState } = camera;

  useEffect(() => {
    let alive = true;
    void createProductDetector().then((value) => {
      if (alive) setDetector(value);
    });
    const connection = () => setOffline(!navigator.onLine);
    connection();
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    return () => {
      alive = false;
      active.current?.abort();
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
    };
  }, []);

  const reset = useCallback(() => {
    active.current?.abort();
    active.current = null;
    stop();
    lastSource.current = null;
    setPhase("capture");
    setPreview(null);
    setResult(null);
    setError(null);
    setBarcodeHint("");
    setProgress(initialScanProgress());
  }, [stop]);

  const analyze = useCallback(
    async (source: File | ScanInput, capturedPreview?: string) => {
      if (active.current) return;
      const controller = new AbortController();
      active.current = controller;
      // Include decoding/detection as well as auth/upload in the bounded operation.
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(75_000)]);
      lastSource.current = source;
      stop();
      setPhase("analyzing");
      setResult(null);
      setError(null);
      setProgress({
        ...initialScanProgress(),
        reading: { status: "active", message: "Preparing your capture for secure analysis." },
      });
      if (source instanceof File) setPreview(null);
      else if (capturedPreview) setPreview(capturedPreview);
      try {
        let input: ScanInput;
        if (source instanceof File) {
          const dataUrl = await prepareScanFile(source, signal);
          if (controller.signal.aborted) return;
          setPreview(dataUrl);
          if (mode === "barcode") {
            if (!detector)
              throw new Error(
                "Barcode detection isn't supported on this device. Enter the product's printed code below instead.",
              );
            const codes = await withScanAbort(detectScanImage(dataUrl, detector, signal), signal);
            const code = codes.map((item) => productCode(item.rawValue)).find(Boolean);
            if (!code)
              throw new Error(
                "No supported product barcode was found. Enter the printed EAN, UPC or GTIN code instead. General QR links are never opened.",
              );
            input = { kind: "barcode", code };
          } else input = { kind: "image", mode, imageDataUrl: dataUrl };
        } else input = source;
        signal.throwIfAborted();
        lastSource.current = input;
        const found = await requestScan(
          input,
          (event) => {
            if (controller.signal.aborted) return;
            if (event.type === "step")
              setProgress((current) => ({
                ...current,
                [event.id]: { status: event.status, message: event.message },
              }));
          },
          signal,
        );
        if (!controller.signal.aborted) {
          setResult(found);
          setPhase("result");
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = signal.aborted
          ? "The scan timed out. Your capture is kept so you can retry."
          : err instanceof Error
            ? err.message
            : "We couldn't finish the scan. Please retry.";
        setError(message);
        setPhase("error");
        setProgress(
          (current) =>
            Object.fromEntries(
              Object.entries(current).map(([id, step]) => [
                id,
                step.status === "active" ? { status: "failed", message } : step,
              ]),
            ) as ScanProgress,
        );
      } finally {
        if (active.current === controller) active.current = null;
      }
    },
    [mode, detector, stop],
  );

  useEffect(() => {
    if (mode !== "barcode" || cameraState !== "live" || !detector) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const detect = async () => {
      const video = videoRef.current;
      if (!video || disposed) return;
      try {
        if (video.readyState >= 2) {
          const codes = await detector.detect(video);
          if (disposed) return;
          const code = codes.map((item) => productCode(item.rawValue)).find(Boolean);
          if (code) {
            let image: string | undefined;
            try {
              image = captureScanImage(video);
            } catch {
              /* The code alone is sufficient. */
            }
            void analyze({ kind: "barcode", code }, image);
            return;
          }
          if (codes.length)
            setBarcodeHint(
              "This QR or barcode is not a supported food product code. Links are never opened.",
            );
        }
      } catch {
        if (!disposed)
          setBarcodeHint(
            "Automatic detection is unavailable. Enter the printed product code below.",
          );
      }
      if (!disposed) timer = setTimeout(() => void detect(), 450);
    };
    void detect();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [mode, cameraState, detector, analyze, videoRef]);

  function cancelAnalysis() {
    active.current?.abort();
    active.current = null;
    setError("Analysis cancelled. Your capture is kept if you want to retry.");
    setPhase("error");
    setProgress(
      (current) =>
        Object.fromEntries(
          Object.entries(current).map(([id, step]) => [
            id,
            step.status === "active"
              ? { status: "attention", message: "Cancelled before this operation finished." }
              : step,
          ]),
        ) as ScanProgress,
    );
  }
  function capture() {
    try {
      if (!videoRef.current) return;
      const imageDataUrl = captureScanImage(videoRef.current);
      if (mode !== "barcode") void analyze({ kind: "image", mode, imageDataUrl }, imageDataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The image could not be captured.");
    }
  }
  function submitBarcode(e: React.FormEvent) {
    e.preventDefault();
    const code = productCode(barcode);
    if (!code) {
      setError("Enter a valid EAN, UPC or GTIN product code, including its check digit.");
      return;
    }
    setPreview(null);
    void analyze({ kind: "barcode", code });
  }

  return (
    <main className="scanner-shell flex-1" aria-label="MealMate scanner">
      <div className="mx-auto w-full max-w-2xl space-y-5">
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <ChefMascot className="size-10 shrink-0" />
            <div>
              <p className="text-xs font-medium tracking-wide text-blue-200">MealMate · Mia</p>
              <h1 className="font-display text-xl">Food scanner</h1>
            </div>
          </div>
          <Button
            variant="ghost"
            className="shrink-0 rounded-full"
            onClick={() => {
              active.current?.abort();
              stop();
              onCancel();
            }}
          >
            <X />
            Cancel
          </Button>
        </header>
        {offline && (
          <p role="status" className="scanner-panel p-3 text-sm text-amber-100">
            You're offline. Camera capture still works; recognition, product lookup and saving
            require a connection.
          </p>
        )}
        <div
          role="group"
          aria-label="Scan type"
          className="grid grid-cols-4 gap-1 rounded-2xl border border-white/10 bg-white/5 p-1"
        >
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={mode === item.id}
              disabled={phase === "analyzing"}
              className={`min-h-11 min-w-0 rounded-xl px-1 text-xs font-semibold transition-colors ${mode === item.id ? "bg-slate-200 text-slate-950" : "text-slate-300 hover:bg-white/5"}`}
              onClick={() => {
                reset();
                setMode(item.id);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          aria-label="Choose scan photo"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void analyze(file);
          }}
        />
        {phase === "capture" ? (
          <>
            <div className="scanner-viewfinder">
              <video
                ref={videoRef}
                muted
                playsInline
                autoPlay
                className={`absolute inset-0 h-full w-full object-cover ${cameraState === "live" ? "opacity-100" : "opacity-0"}`}
                aria-label="Live camera preview"
              />
              {cameraState !== "live" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-10 text-center">
                  {cameraState === "requesting" ? (
                    <Loader2 className="size-8 animate-spin text-blue-200" />
                  ) : (
                    <ScanLine className="size-9 text-blue-200" />
                  )}
                  <p className="max-w-64 text-sm text-slate-200">
                    {cameraState === "requesting"
                      ? "Waiting for camera permission and preview…"
                      : mode === "recipe"
                        ? "Fit the recipe ingredients and instructions inside the frame."
                        : mode === "barcode"
                          ? "Scan a product barcode or a GS1 product QR code."
                          : mode === "ingredients"
                            ? "Keep your ingredients clearly visible and well lit."
                            : "Frame your food or meal in good light."}
                  </p>
                </div>
              )}
              <div className="scanner-frame" aria-hidden="true">
                {cameraState === "live" && <span className="scanner-sweep" />}
              </div>
              {cameraState === "live" && (
                <div className="absolute inset-x-4 bottom-4 flex items-center justify-between gap-2">
                  <span className="rounded-full bg-black/70 px-3 py-2 text-xs">
                    {mode === "barcode" && detector ? "Looking for a product code" : "Camera ready"}
                  </span>
                  {camera.torchAvailable && (
                    <Button
                      variant="secondary"
                      size="icon"
                      className="rounded-full"
                      aria-label={camera.torch ? "Turn flashlight off" : "Turn flashlight on"}
                      aria-pressed={camera.torch}
                      onClick={() => void camera.toggleTorch()}
                    >
                      <Flashlight />
                    </Button>
                  )}
                </div>
              )}
            </div>
            {(camera.error || error) && (
              <p role="alert" className="scanner-panel p-3 text-sm text-amber-100">
                {error || camera.error}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              {cameraState === "live" && mode !== "barcode" ? (
                <Button className="h-12 rounded-full" onClick={capture}>
                  <Camera />
                  Capture
                </Button>
              ) : (
                <Button
                  className="h-12 rounded-full"
                  onClick={() => void camera.start()}
                  disabled={cameraState === "requesting" || cameraState === "live"}
                >
                  <Camera />
                  {cameraState === "requesting"
                    ? "Opening…"
                    : cameraState === "live"
                      ? "Scanning…"
                      : "Open camera"}
                </Button>
              )}
              <Button
                variant="outline"
                className="h-12 rounded-full"
                onClick={() => {
                  stop();
                  fileRef.current?.click();
                }}
              >
                <ImagePlus />
                Choose photo
              </Button>
            </div>
            {cameraState === "requesting" && (
              <Button variant="ghost" className="w-full" onClick={stop}>
                Cancel camera request
              </Button>
            )}
            {mode === "barcode" && (
              <p className="text-xs leading-relaxed text-slate-400">
                {barcodeHint ||
                  (detector
                    ? "Supports EAN, UPC, GTIN and product QR codes available on your device. General QR links stay closed."
                    : "Live barcode detection is not supported on this device. Enter the printed product code below.")}
              </p>
            )}
            <p className="text-center text-xs text-slate-400">
              Photos are sent to MealMate's AI service only when you capture or choose a photo for
              analysis.
            </p>
          </>
        ) : (
          <>
            {preview && (
              <img
                src={preview}
                alt="Your captured scan"
                className="max-h-64 w-full rounded-3xl border border-white/10 bg-black object-contain"
              />
            )}
            {phase === "analyzing" && (
              <>
                <ScannerAnalysis progress={progress} />
                <Button variant="outline" className="w-full rounded-full" onClick={cancelAnalysis}>
                  Cancel analysis
                </Button>
              </>
            )}
            {phase === "error" && (
              <>
                <section role="alert" className="scanner-panel space-y-3 p-5">
                  <AlertCircle className="size-6 text-blue-200" />
                  <h2 className="font-display text-xl">Let's try that again</h2>
                  <p className="text-sm leading-relaxed text-slate-300">{error}</p>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      onClick={() => {
                        if (lastSource.current) void analyze(lastSource.current);
                      }}
                      disabled={!lastSource.current || offline}
                    >
                      Retry analysis
                    </Button>
                    <Button variant="outline" onClick={reset}>
                      <ArrowLeft />
                      New scan
                    </Button>
                  </div>
                </section>
                <details className="scanner-panel p-4">
                  <summary className="cursor-pointer text-sm text-slate-300">
                    Analysis details
                  </summary>
                  <div className="mt-4">
                    <ScannerAnalysis progress={progress} />
                  </div>
                </details>
              </>
            )}
            {phase === "result" && result && (
              <ScannerResults result={result} progress={progress} onReset={reset} />
            )}
          </>
        )}
        {mode === "barcode" && (phase === "capture" || phase === "error") && (
          <form onSubmit={submitBarcode} className="scanner-panel space-y-3 p-4">
            <label htmlFor="product-code" className="text-sm font-medium">
              Enter product code
            </label>
            <input
              id="product-code"
              className="scanner-field w-full"
              inputMode="numeric"
              autoComplete="off"
              maxLength={14}
              placeholder="EAN, UPC or GTIN digits"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
            />
            <Button type="submit" className="w-full" disabled={!barcode.trim() || offline}>
              Look up product
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
