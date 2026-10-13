import { randomUUID, createHmac } from "node:crypto";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { dash, createEmailSender } from "@better-auth/infra";
import { db } from "../../db";
import * as schema from "../../db/schema";
import { withDatabasePrincipal } from "./database-context.server";

let authInstance: ReturnType<typeof betterAuth> | undefined;

export function getAuth() {
  if (authInstance) return authInstance;
  const secret = process.env["BETTER_AUTH_SECRET"] ?? (process.env["BETTER_AUTH_API_KEY"]
    ? createHmac("sha256", process.env["BETTER_AUTH_API_KEY"]).update("mealmate:session:v1:1a9c7db5-bcf0-4c09-afed-827521035b60").digest("base64url")
    : undefined);
  if (!secret) throw new Error("Better Auth signing credentials are not configured");
  const emailSender = createEmailSender();
  const options: BetterAuthOptions = {
    secret,
    baseURL: process.env["BETTER_AUTH_URL"] ?? process.env["DEPLOY_PRIME_URL"] ?? process.env["URL"] ?? "https://mealmatesss.netlify.app",
    database: drizzleAdapter(db, { provider: "pg", schema }),
    advanced: { database: { generateId: () => randomUUID() } },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }) => {
        await emailSender.send({ template: "reset-password", to: user.email, variables: { resetLink: url, userEmail: user.email, appName: "MealMate" } });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await emailSender.send({ template: "verify-email", to: user.email, variables: { verificationUrl: url, userEmail: user.email, appName: "MealMate" } });
      },
    },
    socialProviders: process.env["GOOGLE_CLIENT_ID"] && process.env["GOOGLE_CLIENT_SECRET"] ? {
      google: { clientId: process.env["GOOGLE_CLIENT_ID"], clientSecret: process.env["GOOGLE_CLIENT_SECRET"] },
    } : {},
    plugins: [dash({ activityTracking: { enabled: true } })],
    rateLimit: { enabled: true, storage: "database", modelName: "auth_rate_limit", window: 60, max: 20 },
    databaseHooks: {
      user: {
        create: { after: async (user) => {
          await withDatabasePrincipal({ trusted: true }, async (client) => {
            await client.query("INSERT INTO profiles (id, display_name, avatar_url) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING", [user.id, user.name, user.image ?? null]);
          });
        } },
      },
    },
  };
  authInstance = betterAuth(options);
  return authInstance;
}
