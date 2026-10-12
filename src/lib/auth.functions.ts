import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

async function readSession() {
  const { auth } = await import("@/lib/auth");
  return auth.api.getSession({ headers: getRequestHeaders() });
}

export const getAuthSession = createServerFn({ method: "GET" }).handler(() => readSession());

// Better Auth counterpart of requireSupabaseAuth: rejects anonymous calls and exposes userId.
export const requireAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const session = await readSession();
  if (!session) throw new Error("Unauthorized");
  return next({ context: { userId: session.user.id, user: session.user, session: session.session } });
});
