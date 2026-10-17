import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { firebaseUserDb, verifyFirebaseIdToken } from "@/server/firebase-admin";

export const requireFirebaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();
    const authorization = request?.headers.get("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    if (!match?.[1]) throw new Response("Unauthorized", { status: 401 });

    let claims;
    try {
      claims = await verifyFirebaseIdToken(match[1]);
    } catch {
      throw new Response("Unauthorized", { status: 401 });
    }

    if (!claims.uid) throw new Response("Unauthorized", { status: 401 });
    return next({
      context: {
        firebase: firebaseUserDb(claims.uid),
        userId: claims.uid,
        claims,
      },
    });
  },
);
