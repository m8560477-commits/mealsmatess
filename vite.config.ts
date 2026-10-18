import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

export default defineConfig(({ command }) => ({
  // Expose only explicitly allowlisted public Firebase Web App settings.
  envPrefix: [
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_APP_ID",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_STORAGE_BUCKET",
    "VITE_FIREBASE_FIRESTORE_DATABASE_ID",
    "VITE_FIREBASE_VAPID_KEY",
    "FIREBASE_MEASUREMENT_ID",
  ],
  server: {
    host: "0.0.0.0",
    port: 3000,
  },
  css: { transformer: "lightningcss" },
  resolve: {
    tsconfigPaths: true,
    alias: { "@": `${process.cwd()}/src` },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  ssr: {
    // Firestore relies on module-relative __dirname, so keep it out of the ESM server bundle.
    external: ["firebase-admin", "@google-cloud/firestore"],
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      client: { entry: "client" },
      // src/server.ts wraps the TanStack Start server entry with SSR error handling.
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
    ...(command === "build"
      ? [
          nitro({
            preset: process.env["NITRO_PRESET"] || "vercel",
            traceDeps: ["firebase-admin*", "@google-cloud/firestore*"],
            rollupConfig: {
              external: [/^firebase-admin(?:\/|$)/, /^@google-cloud\/firestore(?:\/|$)/],
            },
          }),
        ]
      : []),
    viteReact(),
  ],
}));
