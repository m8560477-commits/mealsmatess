// Server-only: finds the most accurate real food photo for a recipe.
// Providers (only those with a configured key are used, in priority order):
//   Unsplash (UNSPLASH_ACCESS_KEY) -> Pexels (PEXELS_API_KEY) -> Bing (BING_IMAGE_SEARCH_KEY)
// Candidates are ranked by metadata, then verified visually by Lovable AI.
import { firebaseAdmin } from "@/server/firebase-admin";
import { generateAiImage, generateAiObject } from "@/lib/ai-engine.server";
import { z } from "zod";

export type ProviderName = "Unsplash" | "Pexels" | "Bing";

export interface ImageCandidate {
  provider: ProviderName;
  id: string;
  url: string; // display URL (landscape/regular rendition)
  thumb: string; // small URL used for AI checking + pickers
  width: number;
  height: number;
  title: string;
  photographer?: string;
  photographerUrl?: string;
  pageUrl?: string;
  downloadLocation?: string; // Unsplash download tracking endpoint
  metaScore?: number;
  aiScore?: number | undefined;
  score?: number;
}

export interface RecipeForImage {
  id: string;
  name: string;
  cuisine?: string | null;
  category?: string | null;
  meal_type?: string | null;
  description?: string | null;
  diet_tags?: string[] | null;
  ingredients?: unknown;
}

export const ACCEPT_THRESHOLD = 70;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PER_PAGE = 12;

export function configuredProviders(): ProviderName[] {
  const list: ProviderName[] = [];
  if (process.env["UNSPLASH_ACCESS_KEY"]) list.push("Unsplash");
  if (process.env["PEXELS_API_KEY"]) list.push("Pexels");
  if (process.env["BING_IMAGE_SEARCH_KEY"]) list.push("Bing");
  return list;
}

// ---------- Query building ----------

const STOP = new Set([
  "salt",
  "pepper",
  "water",
  "oil",
  "to",
  "taste",
  "and",
  "or",
  "of",
  "the",
  "a",
  "fresh",
  "chopped",
  "sliced",
  "finely",
  "crushed",
  "large",
  "small",
  "tin",
  "g",
  "ml",
  "tbsp",
  "tsp",
  "cup",
  "cups",
  "clove",
  "cloves",
  "sugar",
  "flour",
  "butter",
  "milk",
  "garlic",
  "onion",
  "onions",
  "egg",
  "eggs",
  "with",
  "for",
  "in",
  "boneless",
  "cubed",
  "grated",
]);

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

export function mainIngredients(r: RecipeForImage, max = 3): string[] {
  const list = Array.isArray(r.ingredients)
    ? (r.ingredients as Array<{ name?: string } | string>)
    : [];
  const nameWords = new Set(words(r.name));
  const out: string[] = [];
  for (const item of list) {
    const raw = typeof item === "string" ? item : (item?.name ?? "");
    const first = raw.split(/[,(]/)[0] ?? "";
    const w = words(first).filter((x) => !nameWords.has(x));
    const phrase = w.slice(0, 2).join(" ");
    if (phrase && !out.includes(phrase)) out.push(phrase);
    if (out.length >= max) break;
  }
  return out;
}

const DISH_TYPE: Array<[RegExp, string]> = [
  [/alfredo|carbonara|bolognese|lasagn|penne|spaghetti|fettuccine|pasta/i, "pasta"],
  [/ramen|noodle|pho|udon|lo mein/i, "noodles"],
  [/curry|bunny chow|tikka|masala|korma/i, "curry"],
  [/burger/i, "burger bun"],
  [/taco|burrito|quesadilla/i, "tortilla"],
  [/pizza/i, "pizza"],
  [/salad/i, "salad bowl"],
  [/soup|stew|potjie/i, "stew bowl"],
  [/rice|jollof|biryani|risotto|paella/i, "rice"],
  [/pancake|waffle/i, "breakfast stack"],
  [/cake|pudding|pie|tart|brownie|cookie/i, "dessert"],
];

export function buildQueries(r: RecipeForImage): string[] {
  const name = r.name.trim();
  const ing = mainIngredients(r);
  const dish = DISH_TYPE.find(([re]) => re.test(name))?.[1];
  const cuisine =
    r.cuisine && !name.toLowerCase().includes(r.cuisine.toLowerCase()) ? r.cuisine : null;
  const diet = (r.diet_tags ?? []).find((t) => /vegan|vegetarian/i.test(t));
  const join = (...p: Array<string | null | undefined | false>) =>
    p.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const qs = [
    join(name, dish && !name.toLowerCase().includes(dish) ? dish : null, ing[0], "food"),
    join(
      diet && !name.toLowerCase().includes(diet.toLowerCase()) ? diet.toLowerCase() : null,
      name,
      ing.slice(0, 2).join(" "),
      dish,
    ),
    join("authentic", cuisine, name, "dish"),
    join(name, "close up food photography"),
    join(name),
  ];
  return [...new Set(qs.filter((q) => q.length > 2))];
}

/** Changes when the parts of a recipe that define the dish change. */
export function recipeSignature(r: RecipeForImage): string {
  const base = `${r.name}|${r.cuisine ?? ""}|${mainIngredients(r, 4).join(",")}`.toLowerCase();
  let h = 2166136261;
  for (let i = 0; i < base.length; i++) {
    h ^= base.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

// ---------- Providers ----------

async function fetchJson(url: string, headers: Record<string, string>): Promise<any | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, { headers });
    if (res.ok) return res.json();
    const body = await res.text().catch(() => "");
    if (res.status === 429 || res.status >= 500) {
      console.warn(`[images] ${new URL(url).host} ${res.status}: ${body.slice(0, 200)}`);
      if (attempt === 0) await new Promise((r) => setTimeout(r, 800));
      continue;
    }
    console.error(`[images] ${new URL(url).host} ${res.status}: ${body.slice(0, 200)}`);
    return null;
  }
  return null;
}

async function searchUnsplash(q: string): Promise<ImageCandidate[]> {
  const key = process.env["UNSPLASH_ACCESS_KEY"]!;
  const u = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=${PER_PAGE}&content_filter=high&orientation=landscape`;
  const data = await fetchJson(u, { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" });
  return (data?.results ?? []).map((p: any) => ({
    provider: "Unsplash" as const,
    id: String(p.id),
    url: `${p.urls?.raw}&w=1200&q=80&auto=format&fit=crop`,
    thumb: p.urls?.small,
    width: p.width,
    height: p.height,
    title: [p.alt_description, p.description, (p.tags ?? []).map((t: any) => t.title).join(" ")]
      .filter(Boolean)
      .join(" "),
    photographer: p.user?.name,
    photographerUrl: p.user?.links?.html
      ? `${p.user.links.html}?utm_source=mealmate&utm_medium=referral`
      : undefined,
    pageUrl: p.links?.html ? `${p.links.html}?utm_source=mealmate&utm_medium=referral` : undefined,
    downloadLocation: p.links?.download_location,
  }));
}

async function searchPexels(q: string): Promise<ImageCandidate[]> {
  const key = process.env["PEXELS_API_KEY"]!;
  const u = `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${PER_PAGE}&orientation=landscape`;
  const data = await fetchJson(u, { Authorization: key });
  return (data?.photos ?? []).map((p: any) => ({
    provider: "Pexels" as const,
    id: String(p.id),
    url: p.src?.large2x ?? p.src?.large,
    thumb: p.src?.medium,
    width: p.width,
    height: p.height,
    title: p.alt ?? "",
    photographer: p.photographer,
    photographerUrl: p.photographer_url,
    pageUrl: p.url,
  }));
}

async function searchBing(q: string): Promise<ImageCandidate[]> {
  const key = process.env["BING_IMAGE_SEARCH_KEY"]!;
  const u = `https://api.bing.microsoft.com/v7.0/images/search?q=${encodeURIComponent(q)}&count=${PER_PAGE}&imageType=Photo&aspect=Wide&safeSearch=Strict&license=Public`;
  const data = await fetchJson(u, { "Ocp-Apim-Subscription-Key": key });
  return (data?.value ?? []).map((p: any) => ({
    provider: "Bing" as const,
    id: String(p.imageId ?? p.contentUrl),
    url: p.contentUrl,
    thumb: p.thumbnailUrl,
    width: p.width,
    height: p.height,
    title: p.name ?? "",
    pageUrl: p.hostPageUrl,
  }));
}

const SEARCHERS: Record<ProviderName, (q: string) => Promise<ImageCandidate[]>> = {
  Unsplash: searchUnsplash,
  Pexels: searchPexels,
  Bing: searchBing,
};

/** Search with a shared database cache so the same query never hits the API twice in a week. */
export async function searchProvider(provider: ProviderName, q: string): Promise<ImageCandidate[]> {
  const cacheKey = `${provider}:${q.toLowerCase()}`;
  const { data: cached } = await firebaseAdmin
    .from("image_search_cache")
    .select("results,created_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();
  if (cached && Date.now() - new Date(cached.created_at).getTime() < CACHE_TTL_MS) {
    return cached.results as unknown as ImageCandidate[];
  }
  const results = (await SEARCHERS[provider](q)).filter((c) => c.url && c.thumb);
  await firebaseAdmin.from("image_search_cache").upsert({
    cache_key: cacheKey,
    provider,
    query: q,
    results: results as any,
    created_at: new Date().toISOString(),
  });
  return results;
}

// ---------- Metadata ranking ----------

const CONFLICTS: Array<[RegExp, RegExp]> = [
  [/alfredo/i, /bolognese|marinara|tomato sauce|curry|pizza|mac and cheese|macaroni/i],
  [/chicken/i, /\bbeef\b|steak|pork|salmon|shrimp|prawn/i],
  [/beef|steak/i, /chicken|salmon|shrimp|tofu/i],
  [/vegan|vegetarian/i, /chicken|beef|pork|bacon|steak|fish|shrimp/i],
  [/curry/i, /pizza|burger|pasta/i],
  [/pizza/i, /burger|pasta|salad|curry/i],
  [/burger/i, /pizza|pasta|curry/i],
];

const NON_FOOD =
  /\blogo|screenshot|menu|collage|text|sign|poster|illustration|vector|icon|cartoon|people|woman|man\b/i;

export function metaScore(c: ImageCandidate, r: RecipeForImage): number {
  const hay = c.title.toLowerCase();
  const nameWords = words(r.name);
  const ing = mainIngredients(r);
  let s = 0;
  if (nameWords.length)
    s += 40 * (nameWords.filter((w) => hay.includes(w)).length / nameWords.length);
  if (ing.length) s += 20 * (ing.filter((w) => hay.includes(w.split(" ")[0]!)).length / ing.length);
  if (r.cuisine && hay.includes(r.cuisine.toLowerCase())) s += 5;
  if (/food|dish|meal|plate|bowl|cuisine/.test(hay)) s += 5;
  const px = (c.width ?? 0) * (c.height ?? 0);
  s += px >= 2_000_000 ? 15 : px >= 800_000 ? 8 : 0;
  const ratio = c.width && c.height ? c.width / c.height : 1;
  s += ratio >= 0.95 && ratio <= 1.9 ? 10 : 0;
  if (c.provider !== "Bing") s += 5; // clear licence from Unsplash/Pexels
  for (const [want, conflict] of CONFLICTS) {
    if (want.test(r.name) && conflict.test(hay) && !conflict.test(r.name)) s -= 40;
  }
  if (NON_FOOD.test(hay)) s -= 15;
  return Math.max(0, Math.min(100, Math.round(s)));
}

// ---------- AI visual verification ----------

function recipeSummary(r: RecipeForImage): string {
  return [
    `Name: ${r.name}`,
    r.cuisine ? `Cuisine: ${r.cuisine}` : null,
    r.category || r.meal_type ? `Type: ${r.category ?? r.meal_type}` : null,
    `Main ingredients: ${mainIngredients(r, 6).join(", ") || "unknown"}`,
    r.description ? `Description: ${r.description.slice(0, 300)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Scores each candidate 0-100 for "this photo shows this exact dish".
 * Returns null if AI is unavailable, so the caller falls back to metadata-only ranking.
 */
export async function aiScore(
  r: RecipeForImage,
  cands: ImageCandidate[],
): Promise<number[] | null> {
  if (cands.length === 0) return null;
  try {
    const content = [
      {
        type: "text" as const,
        text:
          `You verify food photos for a recipe app. Score how well EACH image shows exactly this dish from 0 to 100.\n` +
          `RECIPE:\n${recipeSummary(r)}\n\n` +
          `90+ means exact dish; 70-89 means very likely; 40-69 means similar or unclear; under 40 means a different dish or non-food. Penalize a different main protein, sauce, or dish type heavily. Return one integer score per image in order.`,
      },
      ...cands.flatMap((candidate, index) => [
        {
          type: "text" as const,
          text: `Image ${index + 1} metadata: ${candidate.title.slice(0, 160) || "none"}`,
        },
        { type: "image" as const, image: new URL(candidate.thumb) },
      ]),
    ];
    const result = await generateAiObject({
      feature: "image.relevance",
      provider: "lovable",
      messages: [{ role: "user", content }],
      schema: z.object({
        scores: z.array(z.number().int().min(0).max(100)).length(cands.length),
      }),
      timeoutMs: 30_000,
    });
    return result.scores;
  } catch (error) {
    console.warn("[MealMate images] Relevance check unavailable; using metadata ranking.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return null;
  }
}

// ---------- Orchestration ----------

function dedupe(cands: ImageCandidate[]): ImageCandidate[] {
  const seen = new Set<string>();
  return cands.filter((c) => {
    const k = `${c.provider}:${c.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Rank candidates for one query: metadata first, then AI on the top few. */
async function rank(
  r: RecipeForImage,
  cands: ImageCandidate[],
  aiTop = 6,
): Promise<ImageCandidate[]> {
  const scored = dedupe(cands)
    .map((c) => ({ ...c, metaScore: metaScore(c, r) }))
    .filter((c) => (c.metaScore ?? 0) >= 15)
    .sort((a, b) => (b.metaScore ?? 0) - (a.metaScore ?? 0));
  const top = scored.slice(0, aiTop);
  const ai = await aiScore(r, top);
  return top
    .map((c, i) => {
      const aiS = ai ? ai[i]! : undefined;
      // AI judgement dominates; without AI, metadata must be very strong.
      const score =
        aiS !== undefined
          ? Math.round(aiS * 0.8 + (c.metaScore ?? 0) * 0.2)
          : Math.round((c.metaScore ?? 0) * 0.85);
      return { ...c, aiScore: aiS, score };
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

export interface FindResult {
  best: ImageCandidate | null;
  query: string | null;
  tried: string[];
  reason?: string;
}

/** Progressive search: each query across providers until a confident match is found. */
export async function findBestImage(r: RecipeForImage, maxQueries = 4): Promise<FindResult> {
  const providers = configuredProviders();
  if (providers.length === 0) return { best: null, query: null, tried: [], reason: "no_provider" };
  const tried: string[] = [];
  let bestSoFar: { c: ImageCandidate; q: string } | null = null;
  for (const q of buildQueries(r).slice(0, maxQueries)) {
    tried.push(q);
    for (const p of providers) {
      const ranked = await rank(r, await searchProvider(p, q));
      const top = ranked[0];
      if (top && (!bestSoFar || (top.score ?? 0) > (bestSoFar.c.score ?? 0)))
        bestSoFar = { c: top, q };
      if (top && (top.score ?? 0) >= ACCEPT_THRESHOLD) return { best: top, query: q, tried };
    }
  }
  return { best: null, query: bestSoFar?.q ?? null, tried, reason: "low_confidence" };
}

/** Several good alternatives for the "Change image" picker. */
export async function findAlternatives(r: RecipeForImage, limit = 8): Promise<ImageCandidate[]> {
  const providers = configuredProviders();
  const pool: ImageCandidate[] = [];
  for (const q of buildQueries(r).slice(0, 2)) {
    for (const p of providers) pool.push(...(await searchProvider(p, q)));
  }
  const ranked = await rank(r, pool, 12);
  return ranked.filter((c) => (c.score ?? 0) >= 40).slice(0, limit);
}

export async function saveImage(
  recipeId: string,
  c: ImageCandidate,
  query: string,
  opts: { locked?: boolean; signature: string },
) {
  // Unsplash API terms: trigger a download event when a photo is used.
  if (c.provider === "Unsplash" && c.downloadLocation && process.env["UNSPLASH_ACCESS_KEY"]) {
    void fetch(c.downloadLocation, {
      headers: { Authorization: `Client-ID ${process.env["UNSPLASH_ACCESS_KEY"]}` },
    }).catch(() => {});
  }
  const { error } = await firebaseAdmin
    .from("recipes")
    .update({
      image_url: c.url,
      image_source: c.provider,
      image_query: query,
      image_confidence: c.score ?? null,
      image_attribution: {
        photographer: c.photographer ?? null,
        photographerUrl: c.photographerUrl ?? null,
        pageUrl: c.pageUrl ?? null,
      },
      image_checked_at: new Date().toISOString(),
      image_signature: opts.signature,
      image_locked: opts.locked ?? false,
    })
    .eq("id", recipeId);
  if (error) throw error;
}

export async function markChecked(recipeId: string, signature: string) {
  await firebaseAdmin
    .from("recipes")
    .update({ image_checked_at: new Date().toISOString(), image_signature: signature })
    .eq("id", recipeId);
}

/** True when the stored image is trustworthy and current. */
export function needsSearch(
  row: {
    image_source: string | null;
    image_confidence: number | null;
    image_locked: boolean;
    image_signature: string | null;
    image_checked_at: string | null;
  },
  signature: string,
): boolean {
  if (row.image_locked) return false;
  const verified = !!row.image_source && (row.image_confidence ?? 0) >= ACCEPT_THRESHOLD;
  if (verified && row.image_signature === signature) return false;
  // Don't retry unsuccessful searches more than once a day.
  if (
    row.image_checked_at &&
    row.image_signature === signature &&
    Date.now() - new Date(row.image_checked_at).getTime() < 24 * 3600 * 1000
  ) {
    return false;
  }
  return true;
}

// ---------- AI-generated dish photo (cached per recipe) ----------
const IMAGE_BUCKET = "recipe-images";

function stepText(steps: unknown, max = 6): string {
  if (!Array.isArray(steps)) return "";
  return steps
    .slice(0, max)
    .map((s, i) =>
      `${i + 1}. ${typeof s === "string" ? s : ((s as any)?.text ?? (s as any)?.instruction ?? (s as any)?.step ?? "")}`.slice(
        0,
        160,
      ),
    )
    .join("\n");
}

function ingredientText(ingredients: unknown, max = 14): string {
  if (!Array.isArray(ingredients)) return "";
  return ingredients
    .slice(0, max)
    .map((x) =>
      typeof x === "string"
        ? x
        : [(x as any)?.quantity, (x as any)?.unit, (x as any)?.name ?? (x as any)?.item]
            .filter(Boolean)
            .join(" "),
    )
    .filter(Boolean)
    .join(", ");
}

/** Generates a photo of the finished dish from its ingredients + steps and stores it on the recipe. */
export async function generateAndSaveAiImage(
  r: RecipeForImage & { steps?: unknown },
  signature: string,
): Promise<string | null> {
  const prompt =
    `Photorealistic food photograph of the finished dish "${r.name}"${r.cuisine ? ` (${r.cuisine} cuisine)` : ""}, exactly as made by this recipe.\n` +
    `Ingredients: ${ingredientText(r.ingredients)}\n` +
    `Method:\n${stepText(r.steps)}\n` +
    `Show only the plated final dish so its key ingredients are visible. Natural light, shallow depth of field, real crockery, 3/4 angle. ` +
    `No text, no labels, no people, no hands, not an illustration.`;
  const image = await generateAiImage(prompt, {
    feature: "recipe.image",
    size: "1536x1024",
    timeoutMs: 90_000,
  });
  if (image.bytes.byteLength === 0 || image.bytes.byteLength > 20 * 1024 * 1024) {
    throw new Error("Generated image was empty or exceeded the storage size limit.");
  }
  if (!image.mediaType.startsWith("image/")) {
    throw new Error("AI Gateway returned a non-image response.");
  }
  const extension =
    image.mediaType === "image/jpeg" ? "jpg" : image.mediaType === "image/webp" ? "webp" : "png";
  const path = `${r.id}/${signature}.${extension}`;
  const { error: upErr } = await firebaseAdmin.storage
    .from(IMAGE_BUCKET)
    .upload(path, image.bytes, { contentType: image.mediaType, upsert: true });
  if (upErr) throw upErr;
  const { data: signed, error: signErr } = await firebaseAdmin.storage
    .from(IMAGE_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (signErr || !signed) throw signErr ?? new Error("Could not sign image URL");
  const { error } = await firebaseAdmin
    .from("recipes")
    .update({
      image_url: signed.signedUrl,
      image_source: "AI",
      image_query: r.name,
      image_confidence: 100,
      image_attribution: { generated: true, model: image.model },
      image_checked_at: new Date().toISOString(),
      image_signature: signature,
    })
    .eq("id", r.id);
  if (error) throw error;
  return signed.signedUrl;
}
