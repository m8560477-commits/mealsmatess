// Base64 transport stays below Vercel's 4.5MB function request limit.
export const MAX_RESTAURANT_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_RESTAURANT_IMAGE_BASE64 = Math.ceil(MAX_RESTAURANT_IMAGE_BYTES / 3) * 4 + 100;
export const RESTAURANT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
