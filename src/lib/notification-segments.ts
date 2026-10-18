import type { AnnouncementAudience } from "@/lib/notifications.types";

export type { AnnouncementAudience } from "@/lib/notifications.types";

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function isHealthyInterest(profile: Record<string, unknown>): boolean {
  const preferences =
    profile["preferences"] && typeof profile["preferences"] === "object"
      ? (profile["preferences"] as Record<string, unknown>)
      : {};
  const signals = [
    profile["goal"],
    profile["dietary_preferences"],
    profile["dietary_restrictions"],
    preferences["goal"],
    preferences["dietary_restrictions"],
    preferences["preferred_features"],
  ];
  const text = signals
    .flatMap((value) => (Array.isArray(value) ? strings(value) : [value]))
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return /healthy|healthier|nutrition|balanced|weight\s*loss|lose\s*weight|fitness/.test(text);
}
