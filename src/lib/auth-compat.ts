import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { authClient } from "./auth-client";

type AuthUser = { id: string; email: string; name: string; image?: string | null | undefined; emailVerified: boolean; createdAt: Date };
function compatibleUser(user: AuthUser): User {
  return {
    id: user.id, email: user.email, aud: "authenticated", role: "authenticated",
    app_metadata: {}, user_metadata: { display_name: user.name, avatar_url: user.image },
    created_at: new Date(user.createdAt).toISOString(),
    ...(user.emailVerified ? { email_confirmed_at: new Date(user.createdAt).toISOString() } : {}),
    identities: [{ id: user.id, user_id: user.id, provider: "email", identity_id: user.id }],
  };
}
export async function compatibleSession() {
  const result = await authClient.getSession();
  return {
    data: { session: result.data ? {
      user: compatibleUser(result.data.user), access_token: "", refresh_token: "", token_type: "bearer",
      expires_in: Math.max(0, (new Date(result.data.session.expiresAt).getTime() - Date.now()) / 1000),
    } as Session : null },
    error: result.error,
  };
}

export const compatibleAuth = {
  getSession: compatibleSession,
  getUser: async () => { const result = await compatibleSession(); return { data: { user: result.data.session?.user ?? null }, error: result.error }; },
  onAuthStateChange: (callback: (event: AuthChangeEvent, session: Session | null) => void) => {
    let alive = true;
    const refresh = async () => { const result = await compatibleSession(); if (alive) callback(result.data.session ? "SIGNED_IN" : "SIGNED_OUT", result.data.session); };
    const unsubscribe = authClient.$store.atoms["$sessionSignal"]!.listen(refresh);
    return { data: { subscription: { unsubscribe: () => { alive = false; unsubscribe(); } } } };
  },
  signInWithPassword: async (input: { email: string; password: string }) => authClient.signIn.email(input),
  signUp: async (input: { email: string; password: string; options?: { data?: { display_name?: string }; emailRedirectTo?: string } }) => {
    const result = await authClient.signUp.email({ email: input.email, password: input.password, name: input.options?.data?.display_name ?? input.email.split("@")[0]!, callbackURL: input.options?.emailRedirectTo ?? "/auth/callback" });
    const current = result.error ? null : (await compatibleSession()).data.session;
    return { data: { user: result.data?.user ? compatibleUser(result.data.user) : null, session: current }, error: result.error };
  },
  signOut: () => authClient.signOut(),
  resetPasswordForEmail: (email: string, options?: { redirectTo?: string }) => authClient.requestPasswordReset({ email, redirectTo: options?.redirectTo ?? "/reset-password" }),
  resend: (input: { email: string }) => authClient.sendVerificationEmail({ email: input.email, callbackURL: "/auth/callback" }),
};
