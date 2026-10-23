import { put } from "@vercel/blob";
import { MAX_RESTAURANT_IMAGE_BYTES } from "@/lib/restaurant-media";

export function decodeRestaurantImage(base64: string, contentType: string) {
  const raw = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) throw new Error("Invalid image encoding.");
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length > MAX_RESTAURANT_IMAGE_BYTES)
    throw new Error("Choose an image smaller than 2MB.");
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  const extension =
    contentType === "image/png" && png
      ? "png"
      : contentType === "image/jpeg" && jpeg
        ? "jpg"
        : contentType === "image/webp" && webp
          ? "webp"
          : null;
  if (!extension) throw new Error("Upload a valid JPEG, PNG or WebP image.");
  return { bytes, extension };
}

/** Only public food/restaurant photos. Membership must be checked before calling. */
export async function storeRestaurantImage(
  restaurantId: string,
  kind: string,
  base64: string,
  contentType: string,
) {
  const { bytes, extension } = decodeRestaurantImage(base64, contentType);
  if (!process.env["BLOB_READ_WRITE_TOKEN"] && !process.env["BLOB_STORE_ID"])
    throw new Error("Restaurant photo storage is not configured.");
  const blob = await put(`restaurant-media/${restaurantId}/${kind}.${extension}`, bytes, {
    access: "public",
    contentType,
    addRandomSuffix: true,
    allowOverwrite: false,
    cacheControlMaxAge: 31536000,
  });
  return { url: blob.url, path: blob.pathname };
}
