import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

export default defineConfig(({ command }) => ({
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
    // Firebase Admin and its gRPC deps must stay as Node externals on the server.
    external: ["firebase-admin"],
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      // src/server.ts wraps the TanStack Start server entry with SSR error handling.
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
    ...(command === "build" ? [nitro({ preset: process.env["NITRO_PRESET"] || "vercel" })] : []),
    viteReact(),
  ],
}));
