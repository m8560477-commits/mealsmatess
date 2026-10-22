import { defineConfig, loadEnv } from "vite";
import { publicEnvDefinitions } from "./build/public-env";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

export default defineConfig(({ command, mode }) => ({
  // Explicit definitions prevent a similarly prefixed secret from entering the browser build.
  envPrefix: [],
  define: publicEnvDefinitions(loadEnv(mode, process.cwd(), "")),
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
            // Keep Firestore's CommonJS runtime and module-relative assets intact.
            // Bundle Firebase Auth so jwks-rsa's ESM dependency works on Vercel.
            traceDeps: ["@google-cloud/firestore*"],
          }),
        ]
      : []),
    viteReact(),
  ],
}));
