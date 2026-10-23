# MealMate official website

Independent, static public website for **https://www.mealmate.site/**, maintained inside the Consumer repository. It does not mount the Consumer app, initialise Firebase, call Hub services, collect form submissions, or install analytics. The existing application entry point and deployment configuration are unchanged.

## Development and build

From the repository root, with its existing frozen Bun dependencies installed:

```sh
bun run website:dev    # http://localhost:3002/
bun run website:build  # website/dist/
```

The website reuses the installed Vite toolchain. There are no new dependencies or runtime JavaScript bundles. Keep `website/dist/` out of commits.

## Separate Vercel project

Create a **new** Vercel project, for example `mealmate-website`, connected to `taz650812-design/mealsmatess`:

- Production branch: `main`
- Root Directory: `website`
- Enable **Include source files outside of the Root Directory in the Build Step**.
- Framework: Other
- Install command: `cd .. && bun install --frozen-lockfile`
- Build command: `cd .. && bun run website:build`
- Output directory: `dist`
- No application environment variables or credentials are required.

`website/vercel.json` defines these commands, security/cache headers and a permanent host-specific redirect from `mealmate.site` to `https://www.mealmate.site`, preserving paths. Vercel handles HTTPS. Add both domains to this new project, then use the exact DNS values shown by Vercel at the domain registrar. The website canonical, Open Graph URL and sitemap use `https://www.mealmate.site/`.

**Do not attach this website to the existing Consumer or Hub Vercel projects.** `mealmate.site` is a different domain from `mealsmates.site`. The latter serves the Consumer app, and `www.mealsmates.site` was previously attached to the separate `mealmate-hub` project.

Before release: verify ownership/DNS of `mealmate.site`, HTTPS, root-to-www redirect, homepage/assets, app links and legal links. Preview deployments should remain excluded from search indexing (Vercel's default preview robots header). No Google Play button or QR is included because no verified listing was found.

## Product and destination audit (2026-10-23)

Consumer: `taz650812-design/mealsmatess`, source revision `299adc7da45a12556b0b8ff246fcde27f6241d11` (same application source as deployed merge `aa71fdacdd667a2638a48944561d985753c7eb10`).

- Consumer destination: **https://mealsmates.site/**, verified HTTP 200 and in shared Chromium.
- Existing support, profile, premium and legal routes are linked directly. A support mailbox is declared in source, but ownership/deliverability was not verified; use the existing support page rather than advertise an unverified email address.
- Recipes, saved favourites, planner, grocery list and recipe nutrition have implementations in `src/routes/recipes.tsx`, `cookbook.tsx`, `planner.tsx`, `list.tsx` and `recipe.$slug.tsx`.
- **Dining is coming soon**, per `DiningComingSoon` in `src/routes/restaurants.tsx`; copy explicitly says so.
- Mia appears in the genuine welcome screenshot. AI requests require authenticated services; no end-to-end live generation was exercised, so the website makes no operational AI assistance promise.
- No published Google Play listing was found in the repository.

Hub: read-only audit of `taz2011taz-sys/mealmate-hub`, revision `0606d30f79cadd8b8064f45ef4d75c86a10d622b`.

- Hub destination: **https://mealmate-partners.vercel.app/**, configured in GitHub repository homepage metadata; verified HTTP 200 and shared Chromium welcome screen titled MealMate Partners. Website explains the current name.
- The similarly named `mealmate-hub` Vercel project has no production deployment and is **not** the CTA destination.
- Source implements authenticated dashboard, orders, menu, branches, customers, promotions, analytics and staff routes. No restaurant records, transactions or billing operations were created or tested.
- The dashboard illustration uses the source interface's six metric labels, revenue chart region, popular-items empty message, quick actions and Dashboard / Orders / Menu / More navigation. It is clearly labelled a layout preview, uses no numeric metrics, charts of fabricated results, or restaurant/customer names, and has no fake interactive controls.
- No payment, subscription purchase or restaurant adoption claims appear.

## Asset provenance

All food photos are existing MealMate repository assets. No new generated food photos or external stock URLs were introduced. Marketing renditions are deliberately separate from the recipe runtime pipeline.

| Website asset                                     | Source                                                                                                |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `public/media/salad-{480,960}.webp`, `social.jpg` | `src/assets/recipes/greek-chicken-salad.webp`                                                         |
| `public/media/pasta-{480,960}.webp`               | `src/assets/recipes/creamy-chicken-alfredo.webp`                                                      |
| `public/media/tacos-{480,960}.webp`               | `src/assets/recipes/smoky-beef-tacos.webp`                                                            |
| `public/media/consumer-welcome.webp`              | Actual https://mealsmates.site/welcome screenshot at 390×844; browser scrollbar cropped, UI unaltered |
| `public/media/brand.webp`                         | `public/mascots/mascot-classic.png`, current MealMate brand mark                                      |
| Favicon / touch icon                              | Existing Consumer public assets                                                                       |

WebP renditions use quality 86; the welcome capture uses quality 90. Food media uses `srcset` and viewport sizes. The hero has high fetch priority, below-fold images are lazy loaded, and every image reserves dimensions. Typography matches the app's Manrope family (Google Fonts, `display=swap`) with a system serif accent. Reduced-motion settings disable smooth scrolling and transitions.

## Content maintenance

Update the source audit and destination verification before changing availability claims. Keep real-app screenshots current after significant UI changes. Link to the app's maintained legal pages; do not invent compliance guarantees, testimonials, restaurant counts or pricing. Add a Play link only after verifying the actual published listing. All navigation and calls to action work without JavaScript; the mobile menu uses native `details`/`summary`.

## Google discovery and indexing

The public site ships a single-page XML sitemap at `/sitemap.xml`, referenced by `/robots.txt`. The sitemap intentionally lists only the canonical homepage: section anchors are not separate pages, and Consumer/Hub URLs belong to their own domains. Search metadata includes a descriptive title, canonical URL, index/follow and large-image-preview directives, plus JSON-LD Organization, WebSite and WebPage entities with real branding only. JSON-LD is data, not executable application JavaScript. No reviews, ratings, prices or search actions are fabricated.

After DNS and HTTPS for `www.mealmate.site` work:

1. Open https://search.google.com/search-console/ using the Google account that should own the site.
2. Add a Domain property for `mealmate.site`. Publish the exact DNS TXT verification value Google provides at your DNS provider. No verification token is stored in this repository.
3. Submit `https://www.mealmate.site/sitemap.xml` under **Sitemaps**.
4. Inspect `https://www.mealmate.site/` under **URL inspection**, run **Test live URL**, then **Request indexing** when eligible.
5. Check Page indexing for crawl or canonical issues. Google decides when and whether to index a page; a sitemap submission does not guarantee inclusion or ranking.

Check the production homepage and sitemap return HTTP 200 and have no `X-Robots-Tag: noindex` header. Keep Vercel preview deployments excluded from indexing. Do not use the retired unauthenticated sitemap-ping endpoint; Google no longer supports it. These steps require access to the site's DNS and Google Search Console account.

## Launch update — discover.mealsmates.site

The public website is now launched at **https://discover.mealsmates.site/** in the separate `mealmate-website` Vercel project. This is the current canonical address and supersedes the earlier proposed `www.mealmate.site` launch instructions above. The existing domain's proxy serves the subdomain successfully over HTTPS. No registrar DNS edits were needed. Consumer remains at `https://mealsmates.site/` and Hub at its verified destination.

Canonical, JSON-LD identifiers, Open Graph/social image URLs, sitemap and robots now use `https://discover.mealsmates.site/`. The unresolved `mealmate.site` and `www.mealmate.site` domain attachments remain available for future setup and redirect to discover when they become reachable. Do not submit the unresolved domain's sitemap.

For Google Search Console, verify a URL-prefix property for **https://discover.mealsmates.site/** (using Google's actual verification instructions), or a Domain property for `mealsmates.site` if you control its DNS. Submit **https://discover.mealsmates.site/sitemap.xml**, then inspect the homepage and request indexing. Google account ownership verification is still required; no submission or indexing is claimed.

## Hub entry subdomain — hub.mealsmates.site

**https://hub.mealsmates.site/** forwards to the verified existing Hub application at **https://mealmate-partners.vercel.app/**. Its host-specific temporary 307 redirect is deployed in the website project, preserving paths and query strings. The public website's four Hub links use this branded entry address. Browsers finish on the existing Hub domain; this is forwarding, not a migration of the Hub app or its authentication origin.

The signed-in Vercel team exposes the undeployed `mealmate-hub` project, Consumer and website projects. The working `mealmate-partners.vercel.app` deployment is not available as an editable project in that team, so attaching a custom domain directly to its deployment cannot be done with current access. This redirect avoids changing Hub hosting, authentication, services or application code. If the live Hub project becomes available later, replace forwarding with a direct domain attachment after checking authentication callback URLs. The existing website and Consumer domains are unaffected.
