import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  // The public website has no client environment variables or app services.
  envPrefix: "PUBLIC_WEBSITE_UNUSED_",
  build: { outDir: "dist", emptyOutDir: true },
  server: { host: "0.0.0.0", port: 3002 },
});
