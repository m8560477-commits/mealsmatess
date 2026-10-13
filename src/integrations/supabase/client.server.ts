import { createDataClient } from "@/lib/data-client";
import { handleDataRequest } from "@/lib/database-api.server";
import { handleMediaRequest } from "@/lib/media.server";

const transport: typeof fetch = async (input, init) => {
  const request = new Request(input, init);
  return new URL(request.url).pathname.startsWith("/api/media/")
    ? handleMediaRequest(request, { trusted: true })
    : handleDataRequest(request, { trusted: true });
};
export const supabaseAdmin = createDataClient(transport, process.env["URL"] ?? "https://mealmatesss.netlify.app");
