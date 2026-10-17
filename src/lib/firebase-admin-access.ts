import { createServerOnlyFn } from "@tanstack/react-start";

export const loadFirebaseAdmin = createServerOnlyFn(() => import("@/server/firebase-admin"));
