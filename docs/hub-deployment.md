# MealMate Hub: shared Firebase deployment

## Architecture

The `mealsmates` Vercel project serves two interfaces from this repository:

- `mealsmates.site`: Consumer.
- `hub.mealsmates.site`: current public Hub destination, served directly with no external forwarding.
- `partner.mealsmates.site`: supported legacy hostname; keep host detection for existing links and restore DNS before advertising it again.
- `/hub`: a public Hub introduction for local inspection.

The request hostname selects the interface through the root route context, consistently during SSR and browser navigation. Host selection does not grant access: Firebase ID tokens and restaurant ownership/staff checks still protect every operation. Hub users skip Consumer food-preference onboarding, while Consumer retains its existing onboarding and five-tab navigation. Sessions remain browser-origin scoped: the same Firebase account can sign in on each domain, but this does not silently share a session cookie.

The Hub reuses existing restaurant applications, approval, menu editing, order status transitions and statistics. It adds restaurant profile settings and public image uploads. It does not migrate the legacy Supabase Hub's records, billing, accounts or extra tools. No payment provider or subscription system is introduced.

## Shared data

Hub writes and Consumer reads the same Firebase `restaurants`, `menu_items`, `restaurant_orders` and `order_items` collections. New restaurants are pending, non-demo and paused. Existing administrator approval controls publication. New menu items explicitly set `is_hidden: false` to match Consumer discovery filters. Restaurant order lines are loaded explicitly because Firestore does not support SQL-style select joins.

Restaurant photos are stored under `restaurant-media/<restaurant-id>/` in the existing public Vercel Blob store; Firestore keeps their returned URLs. Existing Firebase Storage image URLs remain readable. New uploads accept JPEG, PNG and WebP up to 2MB (reduced from the old 6MB to fit the Vercel function request limit with base64 overhead), validate signatures and check membership before writing. Uploaded public photos must contain no private documents. Filenames use generated suffixes and immutable caching. Blob credentials stay on the server. Menu photo changes are persisted with Save; cancelling a menu edit may leave an unused public asset for later housekeeping.

## Deployment

1. Deploy this repository's main branch to the existing `mealsmates` Vercel project. Preserve existing environment variables, Firebase and Blob attachments.
2. Move partner.mealsmates.site and hub.mealsmates.site from `mealmate-website` to `mealsmates`, targeting Production directly. Do not configure a redirect destination.
3. In Firebase Authentication > Settings > Authorized domains, add both hostnames. Existing Firebase authDomain remains configured; do not copy server credentials into client variables.
4. Follow Vercel's DNS checks if needed. The existing domain is proxied; verify actual HTTPS responses in addition to its dashboard status.
5. Confirm root, /auth and /partner/dashboard stay on the custom hostname and load the Hub. Confirm Consumer home and website remain available.
6. With authorized test accounts, verify sign-in/email verification, application review, menu/photo writes and Consumer visibility, and cross-restaurant denial. Do not create synthetic records in production during deployment.

The deployment uses the Consumer project's existing Firebase/Blob configuration, avoiding a second set of credentials or a duplicate backend. Public landing and auth-page checks alone do not prove live database writes or Google consent work.

## Connected navigation

The app About and Profile pages and the Hub footer link Consumer, Discover and Hub. Discover links to `https://hub.mealsmates.site/`. The shared `HUB_URL` selects that reachable hostname; `partner.mealsmates.site` remains recognized for compatibility. On 2026-10-24, HTTPS checks returned 200 for Hub and Discover, while partner.mealsmates.site and mealmate.site did not resolve. This changes public navigation destinations only, not authentication, approval or data access. Consumer and Hub still use the same Firebase collections described above, with separate browser-origin sessions.
