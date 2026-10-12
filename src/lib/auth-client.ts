import { createAuthClient } from "better-auth/react";

// Same-origin: requests go to /api/auth/* on the current host.
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
