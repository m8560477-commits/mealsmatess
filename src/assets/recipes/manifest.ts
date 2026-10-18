const recipeImageAssets = import.meta.glob("./*.webp", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const recipeSlugs = [
  "beef-potjiekos",
  "cape-malay-bobotie",
  "chakalaka-with-pap",
  "chicken-bunny-chow",
  "classic-american-apple-pie-rgq3c",
  "classic-banana-bread",
  "creamy-chicken-alfredo",
  "fluffy-buttermilk-pancakes",
  "greek-chicken-salad",
  "kota-south-african-spatlo-7rwhl",
  "malva-pudding",
  "malva-pudding-with-warm-custard-lgoiw",
  "rainbow-buddha-bowl",
  "smoky-beef-tacos",
  "west-african-jollof-rice",
] as const;

function imageUrl(slug: string) {
  const filename = `${slug}.webp`;
  const url = recipeImageAssets[`./${filename}`];
  if (!url) throw new Error(`Missing bundled recipe image: ${filename}`);
  return url;
}

export const RECIPE_PHOTOS: Record<string, { thumb: string; card: string; hero: string }> =
  Object.fromEntries(
    recipeSlugs.map((slug) => {
      const url = imageUrl(slug);
      return [slug, { thumb: url, card: url, hero: url }];
    }),
  );
