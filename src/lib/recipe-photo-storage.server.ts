import { del, put } from "@vercel/blob";

export function assertRecipePhotoStorageConfigured() {
  if (!process.env["BLOB_READ_WRITE_TOKEN"] && !process.env["BLOB_STORE_ID"]) {
    throw new Error("Recipe photo storage is not configured. Connect a public Vercel Blob store.");
  }
}

/** Public recipe photos only. Credentials stay on the server. */
export async function uploadRecipePhoto(path: string, bytes: Uint8Array, contentType: string) {
  assertRecipePhotoStorageConfigured();
  const blob = await put(`recipe-images/${path}`, Buffer.from(bytes), {
    access: "public",
    contentType,
    // A new URL prevents stale CDN images and isolates cleanup from concurrent uploads.
    addRandomSuffix: true,
    allowOverwrite: false,
    cacheControlMaxAge: 31536000,
  });
  return blob.url;
}

export async function deleteRecipePhoto(url: string) {
  await del(url);
}
