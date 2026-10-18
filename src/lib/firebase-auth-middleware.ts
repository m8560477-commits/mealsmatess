import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { loadFirebaseAdmin } from "@/lib/firebase-admin-access";

export const requireFirebaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();
    const authorization = request?.headers.get("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    if (!match?.[1]) throw new Response("Unauthorized", { status: 401 });

    const backend = await loadFirebaseAdmin();
    let verified;
    try {
      verified = await backend.verifyFirebaseIdToken(match[1]);
    } catch {
      throw new Response("Unauthorized", { status: 401 });
    }
    if (!verified.uid) throw new Response("Unauthorized", { status: 401 });
    return next({
      context: {
        firebase: backend.firebaseUserDb(verified.uid),
        userId: verified.uid,
        claims: verified,
      },
    });
  },
);
