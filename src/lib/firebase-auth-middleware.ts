import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export const requireFirebaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();
    const authorization = request?.headers.get("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    if (!match?.[1]) throw new Response("Unauthorized", { status: 401 });

    let userId: string;
    let claims: Record<string, unknown>;
    let firebase: ReturnType<(typeof import("@/server/firebase-admin"))["firebaseUserDb"]>;
    try {
      const backend = await import("@/server/firebase-admin");
      const verified = await backend.verifyFirebaseIdToken(match[1]);
      if (!verified.uid) throw new Error("Missing Firebase UID");
      userId = verified.uid;
      claims = verified as unknown as Record<string, unknown>;
      firebase = backend.firebaseUserDb(userId);
    } catch {
      throw new Response("Unauthorized", { status: 401 });
    }
    return next({ context: { firebase, userId, claims } });
  },
);
