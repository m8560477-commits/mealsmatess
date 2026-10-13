import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { getAuth } = await import("@/lib/auth.server");
  const request = getRequest();
  if (!request) throw new Error("Unauthorized: No request available");
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) throw new Error("Unauthorized: Sign in to continue");
  const { createDataClient } = await import("@/lib/data-client");
  const { handleDataRequest } = await import("@/lib/database-api.server");
  const transport: typeof fetch = (input, init) => handleDataRequest(new Request(input, init), { userId: session.user.id });
  return next({ context: { supabase: createDataClient(transport, "http://mealmate.internal"), userId: session.user.id, claims: { sub: session.user.id, email: session.user.email } } });
});
