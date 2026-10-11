/** Extracts unique, normalized hashtags (no #, lowercase) from free text. */
export function extractHashtags(text: string | null | undefined): string[] {
  if (!text) return [];
  const matches = text.match(/#([a-z0-9_]{1,40})/gi) ?? [];
  const tags = matches.map((m) => m.slice(1).toLowerCase());
  return Array.from(new Set(tags)).slice(0, 10);
}
