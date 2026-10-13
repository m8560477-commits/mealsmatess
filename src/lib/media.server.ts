import { getStore } from "@netlify/blobs";
import type { DatabasePrincipal } from "./database-context.server";

export async function handleMediaRequest(request: Request, principal: DatabasePrincipal): Promise<Response> {
  const path = decodeURIComponent(new URL(request.url).pathname.slice("/api/media/".length));
  if (!/^[a-zA-Z0-9_/-]+\.[a-zA-Z0-9]+$/.test(path) || path.includes("..")) return new Response("Invalid media path", { status: 400 });
  const store = getStore("mealmate-media");
  if (request.method === "PUT") {
    if (!principal.trusted) return new Response("Forbidden", { status: 403 });
    const contentType = request.headers.get("content-type") ?? "";
    if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(contentType)) return new Response("Unsupported media type", { status: 415 });
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > 6 * 1024 * 1024) return new Response("Image too large", { status: 413 });
    await store.set(path, bytes, { metadata: { contentType } });
    return Response.json({ path });
  }
  if (request.method !== "GET") return new Response(null, { status: 405 });
  const result = await store.getWithMetadata(path, { type: "arrayBuffer" });
  if (!result) return new Response("Not found", { status: 404 });
  const contentType = result.metadata["contentType"];
  return new Response(result.data, { headers: { "Content-Type": typeof contentType === "string" ? contentType : "application/octet-stream", "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=86400" } });
}
