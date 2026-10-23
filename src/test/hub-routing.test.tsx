import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { PartnerLayout } from "@/routes/partner";
import { AuthLayout } from "@/routes/auth";

afterEach(cleanup);
describe("Hub nested navigation", () => {
  it.each([
    { path: "/partner", child: "dashboard", component: PartnerLayout },
    { path: "/auth", child: "callback", component: AuthLayout },
  ])("renders $path/$child instead of its parent's form", async ({ path, child, component }) => {
    const root = createRootRoute({ component: Outlet });
    const parent = createRoute({ getParentRoute: () => root, path, component });
    const page = createRoute({
      getParentRoute: () => parent,
      path: child,
      component: () => <h1>Destination content</h1>,
    });
    const router = createRouter({
      routeTree: root.addChildren([parent.addChildren([page])]),
      history: createMemoryHistory({ initialEntries: [`${path}/${child}`] }),
    });
    await router.load();
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole("heading", { name: "Destination content" })).toBeInTheDocument();
  });
});
