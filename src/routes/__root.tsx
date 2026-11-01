import { MiaProvider } from "@/components/mia-provider";
import { HubContext } from "@/components/hub/hub-context";
import { HubShell } from "@/components/hub/hub-shell";
import { isHubSurface } from "@/lib/hub-surface";
import { requestHostname } from "@/lib/hub-request";
import { SplashScreen } from "@/components/splash-screen";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { auth, onAuthStateChanged } from "@/lib/firebase";
import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";

import { AuthGate } from "@/components/auth-gate";
import { MascotThemeProvider } from "@/hooks/use-mascot-theme";
import { THEME_BOOT_SCRIPT } from "@/lib/mascot-theme";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { LocaleProvider } from "@/components/locale-provider";
import { UpgradeModalProvider } from "@/components/upgrade-modal";
import { ConsumerAccessGate } from "@/components/consumer-access-gate";
import { useShellMetrics } from "@/hooks/use-shell-metrics";

function NotFoundComponent() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: ({ location }) => ({ isHub: isHubSurface(requestHostname(), location.pathname) }),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { name: "theme-color", content: "#0a0a0a" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "MealMate" },
      { name: "application-name", content: "MealMate" },
      { title: "MealMate — Cook the world, one recipe at a time" },
      {
        name: "description",
        content:
          "MealMate generates authentic recipes from around the world with AI, plans your week, and builds your grocery list. From pap and chakalaka to global classics.",
      },
      { name: "author", content: "MealMate" },
      { property: "og:title", content: "MealMate — Cook the world, one recipe at a time" },
      {
        property: "og:description",
        content:
          "AI-powered recipes, meal planning, and smart grocery lists rooted in South African and global cuisine.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "MealMate — Cook the world, one recipe at a time" },
      {
        name: "twitter:description",
        content:
          "MealMate generates authentic recipes from around the world with AI, plans your week, and builds your grocery list. From pap and chakalaka to global classics.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.png", type: "image/png", id: "app-icon" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      {
        rel: "apple-touch-icon",
        href: "/apple-touch-icon.png",
        sizes: "180x180",
        id: "apple-touch-icon",
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient, isHub } = Route.useRouteContext();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isMarketplace = pathname === "/restaurants" || pathname.startsWith("/restaurant/");
  const isFlow =
    pathname === "/welcome" ||
    pathname === "/premium" ||
    pathname === "/onboarding" ||
    pathname.startsWith("/auth");
  const showAppHeader = !isHub && pathname !== "/" && !isMarketplace && !isFlow;
  useShellMetrics(showAppHeader ? "with-header" : "no-header");

  useEffect(() => {
    return onAuthStateChanged(auth, (firebaseUser) => {
      router.invalidate();
      if (firebaseUser) void queryClient.invalidateQueries();
      else queryClient.clear();
    });
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <MascotThemeProvider>
          <LocaleProvider>
            <UpgradeModalProvider>
              <HubContext.Provider value={isHub}>
                {isHub ? (
                  <HubShell>
                    <AuthGate publicHome={pathname === "/hub"}>
                      <Outlet />
                    </AuthGate>
                  </HubShell>
                ) : (
                  <ConsumerAccessGate>
                    <MiaProvider>
                      <div
                        className={`theme-backdrop h-dvh w-full overflow-hidden bg-background ${isMarketplace ? "marketplace-dark" : ""}`}
                      >
                        {showAppHeader && <AppHeader />}
                        <div
                          id="app-scroll"
                          className={`h-full overflow-y-auto overscroll-y-none ${isFlow ? "" : "pb-[var(--app-nav-h)] pt-[var(--app-header-h)]"}`}
                        >
                          <div
                            className={`mx-auto flex min-h-full w-full flex-col ${isFlow ? "" : pathname === "/admin" ? "max-w-6xl" : "max-w-3xl"}`}
                          >
                            <AuthGate>
                              <div
                                key={pathname}
                                className="page-enter motion-reveal flex flex-1 flex-col"
                              >
                                <Outlet />
                              </div>
                            </AuthGate>
                          </div>
                        </div>
                        {isFlow ? null : <BottomNav />}
                      </div>
                    </MiaProvider>
                  </ConsumerAccessGate>
                )}
              </HubContext.Provider>
              <Toaster position="top-center" />
              {!isHub && <SplashScreen />}
            </UpgradeModalProvider>
          </LocaleProvider>
        </MascotThemeProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
