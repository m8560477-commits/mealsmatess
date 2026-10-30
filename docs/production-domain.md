<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:6878ac9d5e8b62e45b740013c3d64d61e5ac2f02c25beac61b6d62af9a2264a4 -->

# MealMate production domain

Consumer's official origin is **https://mealsmates.site** in the existing `mealsmates` Vercel project. Keep the existing Firebase project `mealmate-d2e53`, users, database, Blob attachment and server credentials.

## Host boundaries

| Host | Purpose | Routing |
| --- | --- | --- |
| `mealsmates.site` | Consumer | Production app directly |
| `www.mealsmates.site`, `partner.mealsmates.site`, `partners.mealsmates.site` | Existing separate Hub | Preserve `mealmate-hub` project attachments and routes |
| `mealsmates-khaki.vercel.app` | Documented former Consumer address | Permanent redirect to Consumer when attached to this project |
| `hub.mealsmates.site` | Shared Firebase Hub | Direct Production alias in `mealsmates`; retain hostname |
| `discover.mealsmates.site` | Public website | Separate `mealmate-website` project |
| `admin.mealsmates.site` | Separate admin application | Preserve its project attachment and DNS |

`vercel.json` redirects only the documented former Consumer Vercel hostname; preview hosts and all custom subdomains do not match. Account inspection supersedes the proposed partner-domain cutover in `docs/hub-deployment.md`: this task preserves the separate Hub attachments. An unattached Vercel hostname returns Vercel's 404 before repository rules can run. Domain attachments and DNS are account settings and cannot be changed by committing this file.

## Production rollout

1. In the existing `mealsmates` project, confirm `mealsmates.site` targets Production directly. Keep `hub.mealsmates.site` on this project and preserve the other projects' attachments, including `www`, `partner`, and `partners` on `mealmate-hub`. Do not move the apex to the website project or change wildcard DNS. Check the documented former Vercel hostname belongs to this project before attaching it for its redirect.
2. Deploy the Firebase helper proxy first, keeping the existing `VITE_FIREBASE_AUTH_DOMAIN=mealmate-d2e53.firebaseapp.com`. Nitro's `/__/auth/**` route rule forwards helper GET/POST requests transparently to the same Firebase project's helpers. Verify `/__/auth/handler`, `/__/auth/iframe`, and their scripts on `https://mealsmates.site` return Firebase helper content, with query parameters and request bodies preserved. They must not render MealMate's page or redirect to the Firebase hostname.
3. In Firebase Authentication > Settings > Authorized domains, **add** any missing `mealsmates.site`, `partner.mealsmates.site`, and `hub.mealsmates.site`. Entries are hostnames, without a scheme, slash or port. Preserve the entire existing list, including Firebase defaults, localhost, older deployment hosts and other applications.
4. In Google Cloud > Google Auth Platform > Clients, select the existing **web** OAuth client used by this Firebase project's Google provider. Add `https://mealsmates.site` to its authorized JavaScript origins and `https://mealsmates.site/__/auth/handler` to its authorized redirect URIs. Retain `https://mealmate-d2e53.firebaseapp.com/__/auth/handler` and all callbacks used by Hub, previews or other apps. `/auth/callback` is an app route, not Firebase's Google OAuth handler. Confirm the Google provider remains enabled in Firebase.
5. Set **Production only** `VITE_FIREBASE_AUTH_DOMAIN=mealsmates.site` and server-only `MEALMATE_APP_URL=https://mealsmates.site`. Keep all other Firebase Web App values, Firebase Admin identity, AI, Blob and subscription variables intact. Redeploy: Vite embeds public settings at build time. Do not overwrite Vercel's system `VERCEL_URL` or production-deployment variables.
6. Verify Consumer email/password login, password reset, Google popup and popup-blocked redirect completion. The `hub.mealsmates.site` interface shares the compiled Firebase config, so test its Google popup and redirect fallback before promoting this configuration. Check the separately deployed Hub domains independently; preserve their authentication settings. Hub sessions remain origin scoped; do not assume Consumer login signs a browser into Hub. If cross-origin redirect fallback fails, keep the prior working authDomain while arranging a separately verified Hub auth configuration.
7. Confirm all rows in the host table, including deep paths and query strings. Check server endpoints return their normal JSON responses and notification links use the official origin. Do not create synthetic production records.

The Firebase proxy follows [Firebase's redirect guidance, option 3](https://firebase.google.com/docs/auth/web/redirect-best-practices#option-3-proxy-auth-requests-to-firebaseappcom). The existing popup-first sign-in remains in place. The authDomain migration requires verification for each app origin; changing the domain string alone does not validate a Google sign-in flow.

## Android release verification

`capacitor.config.ts` loads `https://mealsmates.site`. Run `bunx cap sync android` before building the next Android artifact; an already installed APK still contains its old server URL until updated. Keep the package ID `com.taztechnologies.mealmate` and existing signing identity.

Verify Chrome on a real Android device: open the official origin, tap Google sign-in, complete account selection, return to MealMate, reload, and confirm the session and existing account data. Repeat with popup blocking to exercise redirect completion.

Also verify the installed app separately if it is part of the release. This checkout uses Firebase's **web** popup/redirect flow inside a Capacitor WebView, with no native Google sign-in plugin. Inspect the newer live source and any Median wrapper release separately before changing its native sign-in integration. An updated URL does not prove Google accepts that embedded browser. If Google rejects it, use a supported native Google credential flow with the existing Firebase project; do not bypass Google's embedded-browser restrictions. Native OAuth configuration must match the Android package and the release signing certificate, which is separate from the web callback configuration.

## Inspection and pending rollout on 2026-10-30

- Initial public probes: Consumer HTTPS 200; `www` returned a 307 to Consumer. Vercel places `www` on the separate Hub project; its attachment is preserved. Later deep-path probes returned 403, so path/query preservation remains unverified.
- Hub and discover: HTTPS 200. `partner.mealsmates.site` fails DNS resolution from this sandbox. Existing `partners` and `admin` respond on their own hostnames.
- Documented former Vercel hostname: 404; another existing Vercel alias requires Vercel login.
- Public Firebase config authorizes Consumer and `partner`, `partners`, and `admin`; `hub.mealsmates.site` is missing. The deployed authDomain is still `mealmate-d2e53.firebaseapp.com`.
- Authenticated Vercel inspection: `mealsmates.site` and `hub.mealsmates.site` are valid Production domains in `mealsmates`. `partner` remains on `mealmate-hub` with invalid DNS; `www` and `partners` are also on that project with proxy detection. No domain attachments or DNS were changed.
- Added `MEALMATE_APP_URL=https://mealsmates.site` to Vercel **Production** as a Config variable. Vercel confirmed success; activation requires a new deployment. The saved authDomain requires email re-verification to reveal and was not changed.
- Current production is newer than this checkout: displayed commit `88cf5bc` in `tazzy-max/mealsmatess`, while this task's connected checkout is `tazlol0909-maker/mealsmatess` at `93c5c6020b6e42bbfba43740848cd4e1518b55ef`. Reconcile the source repository and preserve newer changes before deploying.
- Public checks do not establish successful sign-in. Firebase/Google Cloud needs an authenticated session; no authorized-domain or OAuth-client change was made. Redeployment, callback migration and Android account sign-in remain pending.


<!-- /coderabbit-ai-generated:v1 -->