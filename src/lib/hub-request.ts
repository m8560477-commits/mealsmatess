import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";

export const requestHostname = createIsomorphicFn()
  .server(() => getRequestUrl().hostname)
  .client(() => window.location.hostname);
