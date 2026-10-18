import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/firebase-messaging-config")({
  server: {
    handlers: {
      GET: async () => {
        const config = {
          apiKey: process.env["VITE_FIREBASE_API_KEY"],
          authDomain: process.env["VITE_FIREBASE_AUTH_DOMAIN"],
          projectId: process.env["VITE_FIREBASE_PROJECT_ID"],
          storageBucket: process.env["VITE_FIREBASE_STORAGE_BUCKET"],
          messagingSenderId: process.env["VITE_FIREBASE_MESSAGING_SENDER_ID"],
          appId: process.env["VITE_FIREBASE_APP_ID"],
        };
        if (
          Object.values(config).some((value) => !value) ||
          config.projectId !== "mealmate-d2e53"
        ) {
          return new Response("Firebase messaging configuration is unavailable.", { status: 503 });
        }
        return new Response(`firebase.initializeApp(${JSON.stringify(config)});`, {
          headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            "Cache-Control": "public, max-age=300",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
