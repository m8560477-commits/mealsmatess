// Better Auth server instance. Server-only: route files and *.functions.ts ship to the
// client bundle, so load it inside handlers: const { auth } = await import("@/lib/auth");
import { betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { getDatabase } from "@netlify/database";

const googleClientId = process.env['GOOGLE_CLIENT_ID'];
const googleClientSecret = process.env['GOOGLE_CLIENT_SECRET'];

export const auth = betterAuth({
  // Netlify Database (managed Postgres). Tables live in netlify/database/migrations.
  database: getDatabase().pool,
  secret: process.env['BETTER_AUTH_SECRET'],
  baseURL: process.env['BETTER_AUTH_URL'],
  trustedOrigins: [process.env['URL'], process.env['DEPLOY_PRIME_URL']].filter(
    (origin): origin is string => Boolean(origin),
  ),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders:
    googleClientId && googleClientSecret
      ? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
      : {},
  advanced: {
    // UUID ids keep user ids compatible with the existing uuid user_id columns.
    database: { generateId: "uuid" },
  },
  plugins: [tanstackStartCookies()], // must stay last
});

export type Session = typeof auth.$Infer.Session;
