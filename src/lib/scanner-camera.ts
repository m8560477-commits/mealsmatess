export type ProductDetector = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};
type DetectorConstructor = {
  new (options: { formats: string[] }): ProductDetector;
  getSupportedFormats: () => Promise<string[]>;
};
export async function createProductDetector(): Promise<ProductDetector | null> {
  const Detector = (globalThis as typeof globalThis & { BarcodeDetector?: DetectorConstructor })
    .BarcodeDetector;
  if (!Detector) return null;
  try {
    const available = await Detector.getSupportedFormats();
    const formats = ["ean_13", "ean_8", "upc_a", "itf", "qr_code"].filter((f) =>
      available.includes(f),
    );
    return formats.length ? new Detector({ formats }) : null;
  } catch {
    return null;
  }
}

export function cameraError(error: unknown): string {
  const name = typeof error === "object" && error !== null && "name" in error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Camera permission was not granted. Allow camera access in your app or browser settings, then retry, or choose a photo.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "No usable camera was found. You can choose a photo instead.";
  if (name === "NotReadableError")
    return "The camera is busy. Close other camera apps and retry, or choose a photo.";
  return error instanceof Error
    ? error.message
    : "The camera could not start. Retry or choose a photo.";
}

export function captureScanImage(source: HTMLVideoElement | HTMLImageElement): string {
  const width = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const height = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
  if (!width || !height) throw new Error("The camera or image is not ready yet. Please try again.");
  if (width * height > 40_000_000)
    throw new Error("This image has too many pixels. Choose a smaller photo.");
  const scale = Math.min(1, 1600 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image processing is unavailable on this device.");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const data = canvas.toDataURL("image/jpeg", 0.86);
  if (!data.startsWith("data:image/jpeg;base64,") || data.length > 2_800_000)
    throw new Error("This photo is too large to analyze. Try a smaller image.");
  return data;
}

export async function prepareScanFile(file: File, signal: AbortSignal): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Choose a JPEG, PNG or WebP photo. Convert HEIC images to JPEG first.");
  if (!file.size || file.size > 12 * 1024 * 1024)
    throw new Error("Choose a photo smaller than 12 MB.");
  signal.throwIfAborted();
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<string>((resolve, reject) => {
      const image = new Image();
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        image.onload = null;
        image.onerror = null;
        image.src = "";
      };
      const fail = (error: unknown) => {
        cleanup();
        reject(error);
      };
      const abort = () => fail(signal.reason);
      const timer = setTimeout(
        () => fail(new Error("The photo could not be decoded in time. Try another image.")),
        15_000,
      );
      signal.addEventListener("abort", abort, { once: true });
      image.onload = () => {
        try {
          const data = captureScanImage(image);
          cleanup();
          resolve(data);
        } catch (error) {
          fail(error);
        }
      };
      image.onerror = () =>
        fail(
          new Error("This photo could not be read. Choose a different JPEG, PNG or WebP image."),
        );
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function detectScanImage(
  dataUrl: string,
  detector: ProductDetector,
  signal: AbortSignal,
) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  signal.throwIfAborted();
  const codes = await detector.detect(image);
  signal.throwIfAborted();
  return codes;
}
