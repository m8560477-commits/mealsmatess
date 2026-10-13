import { authClient } from "@/lib/auth-client";

export const lovable = {
  auth: {
    signInWithOAuth: async (provider: string, options?: { redirect_uri?: string; extraParams?: Record<string, string> }) => {
      if (provider !== "google") return { error: new Error("Unsupported sign-in provider"), redirected: false };
      const result = await authClient.signIn.social({ provider: "google", callbackURL: options?.redirect_uri ?? "/" });
      return { error: result.error, redirected: !result.error };
    },
  },
};
