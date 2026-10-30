export async function authenticateApiRequest(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match?.[1]) {
    return {
      response: Response.json({ error: "Sign in to continue." }, { status: 401 }),
    } as const;
  }

  if (!process.env["FIREBASE_SERVICE_ACCOUNT_JSON"]?.trim()) {
    return {
      response: Response.json(
        { error: "Authentication is temporarily unavailable." },
        { status: 503 },
      ),
    } as const;
  }

  try {
    const { firebaseUserDb, verifyFirebaseIdToken } = await import("@/server/firebase-admin");
    const decoded = await verifyFirebaseIdToken(match[1]);
    if (!decoded.uid) {
      return {
        response: Response.json({ error: "Sign in to continue." }, { status: 401 }),
      } as const;
    }
    try {
      const { requireActivePremium } = await import("@/server/revenuecat");
      await requireActivePremium(decoded.uid);
    } catch (error) {
      return {
        response: Response.json(
          {
            error:
              error instanceof Response && error.status === 402
                ? "An active Premium subscription is required."
                : "Subscription verification is temporarily unavailable.",
          },
          { status: error instanceof Response && error.status === 402 ? 402 : 503 },
        ),
      } as const;
    }
    return {
      user: {
        userId: decoded.uid,
        firebase: firebaseUserDb(decoded.uid),
      },
    } as const;
  } catch {
    return {
      response: Response.json({ error: "Sign in to continue." }, { status: 401 }),
    } as const;
  }
}
