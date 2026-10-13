import { createIsomorphicFn } from "@tanstack/react-start";
import { createDataClient } from "@/lib/data-client";
import { compatibleAuth } from "@/lib/auth-compat";
import { pollingChannel } from "@/lib/polling-channel";

const transport: typeof fetch = createIsomorphicFn()
  .client((input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, { ...init, credentials: "same-origin" }),
  )
  .server(async (input, init) => {
    const { handleDataRequest } = await import("@/lib/database-api.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    const headers = new Headers(init?.headers);
    try { const cookie = getRequest()?.headers.get("cookie"); if (cookie) headers.set("cookie", cookie); } catch { }
    const { getAuth } = await import("@/lib/auth.server");
    const session = headers.has("cookie") ? await getAuth().api.getSession({ headers }) : null;
    return handleDataRequest(new Request(input, { ...init, headers }), session ? { userId: session.user.id } : {});
  });

export const supabase = createDataClient(transport, typeof window === "undefined" ? "http://mealmate.internal" : window.location.origin);
Object.assign(supabase, { auth: compatibleAuth, channel: pollingChannel, removeChannel: (channel: ReturnType<typeof pollingChannel>) => channel.unsubscribe() });
