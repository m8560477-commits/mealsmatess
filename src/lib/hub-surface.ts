/** Host selection changes presentation only; server functions still enforce membership. */
export const HUB_HOSTS = ["partner.mealsmates.site", "hub.mealsmates.site"] as const;
export const CONSUMER_URL = "https://mealsmates.site";
export const HUB_URL = "https://hub.mealsmates.site";
export const DISCOVER_URL = "https://discover.mealsmates.site";

export function isHubHostname(hostname: string) {
  return HUB_HOSTS.some((host) => host === hostname.toLowerCase().replace(/\.$/, ""));
}

export function isHubSurface(hostname: string, pathname: string) {
  return (
    isHubHostname(hostname) ||
    pathname === "/hub" ||
    pathname === "/partner" ||
    pathname.startsWith("/partner/")
  );
}
