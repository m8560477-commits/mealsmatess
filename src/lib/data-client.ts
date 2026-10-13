import { PostgrestClient } from "@supabase/postgrest-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export function createDataClient(transport: typeof fetch, baseURL: string) {
  const rest = new PostgrestClient<Database>(`${baseURL}/api/data`, { fetch: transport });
  const storage = {
    from: (bucket: string) => ({
      upload: async (path: string, body: BodyInit, options?: { contentType?: string }) => {
        const response = await transport(`${baseURL}/api/media/${encodeURIComponent(bucket)}/${path}`, {
          method: "PUT", body, headers: { "Content-Type": options?.contentType ?? "application/octet-stream" },
        });
        return response.ok ? { data: { path }, error: null } : { data: null, error: { message: "Media upload failed" } };
      },
      getPublicUrl: (path: string) => ({ data: { publicUrl: `${baseURL}/api/media/${encodeURIComponent(bucket)}/${path}` } }),
      createSignedUrl: async (path: string) => ({ data: { signedUrl: `${baseURL}/api/media/${encodeURIComponent(bucket)}/${path}` }, error: null }),
    }),
  };
  return { from: rest.from.bind(rest), rpc: rest.rpc.bind(rest), storage } as unknown as SupabaseClient<Database>;
}
