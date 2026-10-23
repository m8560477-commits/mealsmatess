const recipeImageAssets = import.meta.glob("./**/*.{webp,jpg}", {
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

function imageUrl(slug: string, size: "thumb" | "card" | "hero") {
  const filename = size === "hero" ? `${slug}.webp` : `${slug}-${size}.webp`;
  const url = recipeImageAssets[`./${filename}`];
  if (!url) throw new Error(`Missing bundled recipe image: ${filename}`);
  return url;
}

export const RECIPE_PHOTOS: Record<string, { thumb: string; card: string; hero: string }> =
  Object.fromEntries(
    recipeSlugs.map((slug) => {
      return [
        slug,
        {
          thumb: imageUrl(slug, "thumb"),
          card: imageUrl(slug, "card"),
          hero: imageUrl(slug, "hero"),
        },
      ];
    }),
  );

export const DISH_RENDITIONS: Record<string, { thumb: string; card: string; hero: string }> =
  Object.fromEntries(
    ["ackee-and-saltfish", "quinoa-harissa-chicken", "pizza-margherita"].map((slug) => [
      slug,
      {
        thumb: recipeImageAssets[`./dishes/${slug}-thumb.webp`]!,
        card: recipeImageAssets[`./dishes/${slug}-card.webp`]!,
        hero: recipeImageAssets[`./dishes/${slug}.jpg`]!,
      },
    ]),
  );
