/** Normalize camera and gallery photos before sending them to the vision API. */
export async function prepareScanPhoto(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.type)) {
    throw new Error("Choose a JPEG, PNG, WebP or GIF photo. Convert HEIC photos to JPEG first.");
  }
  if (file.size === 0 || file.size > 20 * 1024 * 1024) {
    throw new Error("Choose a photo smaller than 20 MB.");
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reader.onabort = () =>
      reject(new Error("Couldn't read this photo. Try another."));
    reader.readAsDataURL(file);
  });
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error("Couldn't open this photo. Try another."));
    image.onload = () => {
      try {
        if (!image.width || !image.height) throw new Error("This photo has no image content.");
        const scale = Math.min(1, 1024 / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Photo processing is unavailable. Try another browser.");
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        // Re-encode even small images: source bytes can exceed the request size limit.
        const result = canvas.toDataURL("image/jpeg", 0.85);
        if (!result.startsWith("data:image/jpeg;base64,") || result.length > 2_800_000) {
          throw new Error("This photo is too large to scan. Try a smaller photo.");
        }
        resolve(result);
      } catch (error) {
        reject(error);
      }
    };
    image.src = dataUrl;
  });
}
