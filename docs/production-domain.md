<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:025fe993987ed4b49941c86bcd01512c3e6f1965055cc4568690920ad8902272 -->

# MealMate production domain

Consumer's official production origin is **https://mealsmates.site** in the existing `mealsmates` Vercel project. Preserve Firebase project `mealmate-d2e53`, users, database, existing app code, and all service credentials.

## Host boundaries

| Host | Project and routing |
| --- | --- |
| `mealsmates.site` | `mealsmates`, direct Production |
| `www.mealsmates.site` | `mealsmates`, permanent 308 redirect to apex, preserving path/query |
| `hub.mealsmates.site` | `mealsmates`, direct Production; retain hostname |
| `partner.mealsmates.site`, `partners.mealsmates.site` | Separate `mealmate-hub`; preserve attachments and DNS |
| `discover.mealsmates.site` | Separate `mealmate-website`; preserve |
| `admin.mealsmates.site` | Separate `mealmate-admin`; preserve |

The user's latest explicit domain checklist changes the earlier instruction to preserve the `www` Hub attachment. On 2026-10-30, exactly `www.mealsmates.site` was moved from `mealmate-hub` to `mealsmates`, with a Vercel domain-level 308 redirect to `mealsmates.site`. The other attachments remain intact. The separate typo hostname `www.mealsmate.site` was not changed.

The repository's `vercel.json` also contains a redirect for the documented former Consumer hostname `mealsmates-khaki.vercel.app`; that source patch has not been deployed. An unattached Vercel hostname returns 404 before repository rules run. Domain-level redirects are Vercel account settings and apply independently of that file.

## DNS and HTTPS

Authoritative nameservers are `ashton.ns.cloudflare.com` and `brenna.ns.cloudflare.com`. Preserve these and all unrelated zone records. Vercel reports a Cloudflare proxy on the apex; the public apex A records are `104.21.92.230` and `172.67.199.100`. These are observed Cloudflare addresses, not recommended Vercel origin addresses.

For `www`, the project's DNS panel specifies:

| Type | Name | Required target |
| --- | --- | --- |
| CNAME | `www` | `204900adb0666974.vercel-dns-017.com.` |

Vercel also reports conflicting public AAAA answers `2606:4700:3031::ac43:c764` and `2606:4700:3036::6815:5ce6`. Inspect the actual Cloudflare zone first: proxied records can generate those answers. Configure only the requested hosts using the current Vercel recommendations; use DNS-only where required and remove explicit conflicting records only after inspection. Do not delete wildcard, Hub, mail, verification or other records. The apex panel currently reports Proxy Detected without exposing a required origin A value; do not invent one.

DNS edits remain pending Cloudflare login. Current HTTPS works with certificate verification enabled. Vercel's domain overview shows managed certificates with automatic renewal and expiration January 20, 2027. No certificate upload or nameserver migration is needed.

## Firebase and Google OAuth

Fresh public Firebase configuration confirms the existing `authDomain` is `mealmate-d2e53.firebaseapp.com`. Desktop Google sign-in from the official origin reaches Google's sign-in page using:

- Existing web client: `57742324875-siq9p57rm30bpf644b19q4bb6k4ipphn.apps.googleusercontent.com`.
- Observed redirect URI: **`https://mealmate-d2e53.firebaseapp.com/__/auth/handler`**.

Preserve this verified callback and Firebase authDomain. A custom application domain does not itself require changing the Firebase helper domain. Do not add an invented `/auth/callback` OAuth handler or switch helpers without a separately verified migration. The earlier custom-helper proxy patch in this branch remains undeployed and is not required for the verified current popup initiation.

Firebase already authorizes `mealsmates.site` and retains its Firebase defaults and existing partner/admin/deployment hosts. `www.mealsmates.site` is absent and must be added to satisfy the checklist. `hub.mealsmates.site` is also absent; reconcile its existing sign-in requirements while preserving the complete authorized-domain list.

In Firebase Console, confirm Google remains enabled and inspect its existing web client. In Google Cloud, inspect that same client, verify authorized JavaScript origins for `https://mealsmates.site` and `https://www.mealsmates.site`, and retain the observed Firebase redirect URI plus other working callbacks. Firebase/Google Cloud console inspection and writes remain blocked by Google login. Reaching Google's account form proves initiation, not completed account selection or session restoration.

## Production environment and deployment

The only variable added during this task is **Production** `MEALMATE_APP_URL=https://mealsmates.site`. Existing Firebase, Admin, AI, Blob and subscription configuration remains intact. The saved authDomain value was not changed; fresh deployed assets confirm the Firebase helper domain above.

Current live source is `tazzy-max/mealsmatess`, commit `88cf5bc`, deployment `mealsmates-3rrgcw6k7-tazzy3.vercel.app`. This differs from the connected task repository `tazlol0909-maker/mealsmatess`. Preserve current production code: redeploy the existing Current production deployment through Vercel to activate the URL variable. Do not deploy this checkout over it without source reconciliation.

The redeploy dialog was prepared for the same Current source and Production environment. Vercel requires email reauthentication before submission; no new build started and the URL variable remains pending activation. Complete verification, redeploy, wait for Ready/current Production, and repeat live checks.

## Observed tests on 2026-10-30

- Apex HTTPS 200 with valid TLS; HTTP redirects to HTTPS once.
- `www` now returns 308 to apex; `/auth?domain_check=final` reaches the same path/query with HTTPS 200 after one redirect. HTTP `www` reaches it after two redirects; no loop observed on those paths.
- Cloud Chromium desktop loads the existing login UI and Google account form with the verified client/callback. Full login, missing-state and account-return checks remain pending an authorized test account.
- `hub`, `partners` and `discover` return HTTPS 200 on their own hostnames; `admin` reaches its login page. These checks prove reachability, not complete feature coverage.
- `partner.mealsmates.site` fails DNS resolution, as it did before this change. Its attachment/DNS was not changed.
- No Android device is connected to this sandbox. Android Chrome and the installed Google Play application's account-selection-and-return tests remain blocked; a successful debug build from the prior task does not establish store sign-in.

The Capacitor source in this branch loads the official origin and keeps package `com.taztechnologies.mealmate`. An installed Play/Median wrapper may differ from this source; inspect the actual installed package/version and release signing configuration before changing native OAuth. Do not bypass Google's embedded-browser restrictions. Test the installed Play version separately from a browser or debug APK.


<!-- /coderabbit-ai-generated:v1 -->