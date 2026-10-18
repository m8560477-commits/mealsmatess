import { createMiddleware } from "@tanstack/react-start";
import { waitForFirebaseAuth } from "@/lib/firebase";

export const attachFirebaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const user = await waitForFirebaseAuth();
    const token = await user?.getIdToken();
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
  },
);
