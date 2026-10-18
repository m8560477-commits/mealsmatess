# Personalized onboarding and Premium access

## Stack and implementation

The existing app remains React 19 / TanStack Start / Vite / Nitro on Vercel, Firebase Auth and the **named Firestore database `default`** in `mealmate-d2e53`. Mia uses the existing AI gateway. Recipe photographs remain stored/curated; explicit image generation continues to use Vercel Blob. The five bottom navigation destinations are preserved. Android uses Capacitor; no iOS project exists in this checkout.

| Files / area                                                                                    | Changes                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `routes/onboarding.tsx`, `lib/onboarding-model.ts`, `lib/onboarding.functions.ts`, `styles.css` | Twelve responsive screens, actual-answer summary, real catalog/AI preview, errors/retry, required-answer validation and server-confirmed completion                            |
| `hooks/use-preferences.ts`, `lib/preferences.ts`, `lib/preferences.functions.ts`                | Account-scoped drafts, profile persistence/resume, preservation of existing preferences                                                                                        |
| `lib/recipe-safety.ts`, catalog/AI/planner functions, recipes/home routes                       | Exclude known conflicts, ingredient-aware checks, invalidation after preference edits                                                                                          |
| `components/personalized-home.tsx`                                                              | Saved Mia greeting, starter recipes, categories and prompts                                                                                                                    |
| `lib/entitlement-policy.ts`, `lib/entitlements.server.ts`                                       | Central paid/trial/complimentary/family/promotion resolver; explicit expiry and fail-closed verification                                                                       |
| `lib/admin-access.server.ts`, `lib/premium-grants.*`, `components/admin/premium-grants.tsx`     | Trusted admin authorization, grants by email, pending activation, extend/revoke/history/search/filter/counts                                                                   |
| `lib/revenuecat.server.ts`, webhook route                                                       | Authoritative subscriber fetch, cancellation/grace/expiry/transfer handling, bearer + raw-body HMAC, idempotent transactions, independent referral rewards and payment records |
| `lib/purchases.client.ts`, `components/subscription-options.tsx`, `hooks/use-premium.ts`        | Actual web/native offers, provider prices, checkout/restore, backend confirmation, login/focus/resume refresh                                                                  |
| `lib/family.functions.ts`                                                                       | Owner plus five seats, verified-email invitation acceptance, removal/leave and current paid/trial owner verification                                                           |
| `lib/personal-items.functions.ts`, `lib/firebase-data.ts`, `firestore.rules`                    | Server-authorized Premium writes; no client grant/billing/role edits or onboarding completion; safe profile updates preserved                                                  |
| `capacitor.config.ts`, Android generated Gradle files                                           | Correct Vercel URL and registration of RevenueCat/App lifecycle plugins                                                                                                        |

All source paths above are relative to `src/` except root config/rules/Android files. Dependencies and `bun.lock` include the RevenueCat web/Capacitor SDKs, Capacitor App and Firebase emulator test tooling. Subscription pricing is read from the provider, not converted from hardcoded prices.

The starter plan is a **suggestion**, not silently saved to a calendar. Reminders save preferences; no notification permission is requested during setup. Family invitations appear after matching-email verification; no invitation email is automatically sent. Dietary checks are conservative and do not establish cross-contact or unlisted-ingredient safety. No image generation occurs simply by browsing onboarding.

## Database migration

No SQL or replacement database is added. Server operations create these collections lazily:

- `premium_grants/{sha256(normalizedEmail)}` and its `history` subcollection.
- `billing_customers/{uid}`, `subscription_events`, `payments`, `audit_logs`.
- `family_households`, `family_invitations`, `family_memberships`.
- `onboarding_experiences/{uid}`, `onboarding_generation_usage/{uid}`.
- `legacy_premium_access`, `access_migrations/{uid}`.

Answers and step are stored in `users/{uid}.preferences`. Completion is server-owned. Pending grants use trimmed, lowercase email addresses without removing dots or plus tags. Duration starts only after a fresh Firebase Auth record proves that the matching email is verified. Existing verified users are bound by Firebase UID.

`lib/legacy-access.server.ts` performs an idempotent additive migration on first verified-user access: active historical manual admin subscriptions become grants; promo records are copied to independent access documents. Original subscription records are never edited or deleted. Grant revocation cannot cancel paid access. Existing paid access must be reverified through RevenueCat using the Firebase UID; reconcile any historical RevenueCat IDs that differ before rollout.

The new collections inherit default-deny browser access. Premium personal writes now go through authenticated server functions. Rules protect server-owned preferences/completion while allowing safe profile settings updates. Existing indexes remain applicable; new queries use automatically indexed fields/equality combinations.

## Configuration

Keep the working Firebase and AI environment variables. Add these to the actual **tazzy3/mealsmates** Vercel project; `.env.example` documents their names.

| Variable                            | Purpose                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| `MEALMATE_ADMIN_UIDS`               | Server-only comma-separated verified Firebase UIDs, or retain trusted `user_roles` records |
| `REVENUECAT_SECRET_API_KEY`         | Server-only subscriber API credential                                                      |
| `REVENUECAT_PREMIUM_ENTITLEMENT_ID` | Entitlement ID; defaults to `premium`                                                      |
| `REVENUECAT_FAMILY_PRODUCT_IDS`     | Exact comma-separated family product IDs across configured platforms                       |
| `REVENUECAT_WEBHOOK_SECRET`         | Server-only webhook bearer secret                                                          |
| `REVENUECAT_WEBHOOK_SIGNING_SECRET` | Server-only webhook HMAC secret                                                            |
| `VITE_REVENUECAT_WEB_API_KEY`       | Public web SDK key; web billing/payment processor must be configured                       |
| `VITE_REVENUECAT_ANDROID_API_KEY`   | Public Google Play SDK key                                                                 |
| `VITE_REVENUECAT_IOS_API_KEY`       | Public Apple SDK key when an iOS project is added                                          |
| `REVENUECAT_ALLOW_SANDBOX`          | `false` in production; `true` only in a separate sandbox deployment                        |

Resolve the owner's chosen **verified email** to its Firebase UID using an authorized server/console session before setting the initial administrator. Never authorize by a client-supplied email. Never put server secrets in `VITE_` variables or paste them into chat.

## Deployment checklist

1. Configure RevenueCat web/native apps, monthly/yearly/family products, the `premium` entitlement and a current offering. Configure eligible 14-day trials in the store/provider. Eligibility and renewal terms come from the provider.
2. Set the environment variables and administrator UID. Public SDK keys need a rebuild. Configure webhook URL `https://mealsmates-khaki.vercel.app/api/public/webhooks/revenuecat`, bearer authorization and HMAC signing. Signature header: `X-RevenueCat-Webhook-Signature: t=<unix seconds>,v1=<hex>` over `<timestamp>.<raw body>`, with five-minute tolerance. Subscribe to lifecycle and transfer events.
3. Validate purchases, restore, trial eligibility, renewal, cancellation, grace, expiration, refunds and family membership in a separate provider sandbox. Paid snapshots remain usable only while unexpired and verified within six hours; outages never create access.
4. Coordinate application/rules rollout. Deploy named-database rules with `bunx firebase deploy --only firestore --project mealmate-d2e53` using authorized Firebase credentials. Merge/deploy the application and confirm the correct production alias. Deploying the new paywall without configured billing would leave users with no purchasable plans.
5. Migrations run lazily; no bulk destructive operation is required. Verify admin grant/extend/revoke/history and pending signup with authorized test identities.
6. `bunx cap sync android`, build and release through the existing Android process. Plugin registration is committed. iOS requires a macOS/Xcode project and store configuration before device verification.

## Validation commands

```bash
bun install --frozen-lockfile
bun run test
bunx tsc --noEmit
# Java 21 required; synthetic demo projects only:
bunx firebase emulators:start --project demo-mealmate --only auth,firestore --config firebase.emulators.json
# Separate shell:
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 bun run test:integration
# With public Firebase web config set:
bun run build
node scripts/smoke-vercel.mjs
```

Integration tests use real Firebase emulator transactions and security rules, with synthetic AI/RevenueCat responses. They do not prove live provider configuration. Browser visual tests use the real onboarding component with a labelled synthetic profile harness. The delivery report records observed results and outstanding live checks.
