<!-- coderabbit-ai-generated:v1 -->

# Consumer onboarding and RevenueCat subscription gate

## Flow and access contract

The Consumer app now shows four benefit screens, then `/premium`. Completing the intro remembers presentation progress only. Monthly, Yearly and Family options are read from RevenueCat offering `default`; access requires entitlement `premium`. Yearly is an editorial recommendation, with no fabricated savings or popularity claims. No guest or dismissal action opens the Consumer app.

Purchases happen before the existing Firebase sign-in flow. The server creates a random checkout identity and a separate HttpOnly claim cookie. After RevenueCat confirms payment or an eligible trial, the user signs in through the existing authentication screen. The server transaction binds the checkout identity to exactly one Firebase account. Future devices use that account's saved RevenueCat identity. Existing Firebase-UID RevenueCat customers are supported directly. Recovery uses native Restore Purchases on Android, or the original signed-in account on the web. A confirmed existing identity proceeds without another checkout.

Onboarding completion is persisted locally, with account completion saved separately in `intro_completion/{uid}` after sign-in. Existing completed personal onboarding is recognized. The existing personal preferences/notifications setup remains available to subscribers at `/onboarding`; authentication, email verification, Google redirect handling, AI inputs, navigation and Hub membership are retained.

### Intentional policy change

The previous Consumer policy allowed free AI allowances, a Continue Free button and manually granted subscription rows. This task replaces those access paths with RevenueCat verification. Legacy subscriptions/payments/referrals remain for administrative history, but neither those records nor browser storage unlock Consumer Premium. Existing manual-only accounts need an active RevenueCat entitlement under the requested policy.

## Required configuration before rollout

Use the existing RevenueCat project for **both** Android and Web Billing. Do not create duplicate products or change existing store prices.

| Variable | Scope | Purpose |
| --- | --- | --- |
| `REVENUECAT_WEB_PUBLIC_KEY` | Server configuration, safe for SDK delivery | Existing Web Billing app public SDK key |
| `REVENUECAT_ANDROID_PUBLIC_KEY` | Server configuration, safe for SDK delivery | Existing Google Play app public SDK key |
| `REVENUECAT_SECRET_API_KEY` | Server secret only | Authenticated v1 subscriber lookup |
| `REVENUECAT_WEBHOOK_SECRET` | Server secret only | Existing webhook authorization |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Server secret only | Existing Firebase Admin identity, never exposed to browser |

The service account also needs its existing Firestore/Auth permissions. Retain the Firebase project, database, Google client and official-domain configuration from the existing deployment. No credentials were available in this sandbox, and no store or Firebase console settings were altered by this patch.

In offering `default`, attach the existing monthly and annual recurring packages, plus a custom package named `family` (or a package/product identifier with a separated `family` segment). All products must grant `premium`. Family is a store plan choice; this patch does not invent household seats or change existing sharing rules. Configure restore/transfer policy in RevenueCat for the intended account ownership behavior.

Only standard recurring plans are rendered. Google Play prepaid/installment options and offers with intermediate paid introductory phases are excluded because they require different contract disclosures. Monthly/yearly products with no intro discount and an eligible seven-day free phase show **7 days free, then the live renewal price and billing period**. Ineligible users see Subscribe and the regular price. The native purchase uses the exact displayed eligible subscription option. Never hardcode trial eligibility, price, currency or a product receipt.

Web Billing must be enabled and connected to its existing processor. Checkout is SDK-managed; the response CSP permits its Stripe/Paddle scripts and payment frames. Android must be distributed with the newly linked Capacitor RevenueCat plugin. An older installed wrapper has no plugin and remains blocked with an error instead of falling back to web checkout.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:47db4ba8d87caecdc3af4c6b6883cea606be758add53ce0719a2f26f06b4631d -->

Production rejects sandbox entitlement responses. Explicit nonproduction verification can set `REVENUECAT_ALLOW_SANDBOX=true` on a Vercel preview/development environment or a local development server. Production Vercel deployments and standalone production Node processes ignore this switch and `REVENUECAT_API_BASE_URL`. Play license-tester purchases must be tested against that isolated nonproduction deployment with a test wrapper pointing to it; the production wrapper still uses the official domain. Verify production with an authorized real subscriber or trial account. Local synthetic tests use mocks; they do not prove real store purchases.

<!-- /coderabbit-ai-generated:v1 -->

## Enforcement and data

- The complete Consumer shell waits for authenticated, server-confirmed access. Direct routes do not mount the main app first. Verification errors, offline state and expired leases block it.
- AI APIs and Consumer recipe/planner/image server functions independently verify RevenueCat before doing work. The server's Firebase table adapter checks Consumer personal data and catalog access as well.
- Browser Firestore access requires `premium_access/{uid}` with `source=revenuecat`, `entitlement=premium`, and a future `valid_until` Timestamp. Only the server can write this record. It expires after at most five minutes or the entitlement end, whichever comes first. The foreground app checks every minute, on focus, and at checkout completion. A remote revocation can remain reflected in the Firestore lease for up to five minutes; server operations still request RevenueCat verification.
<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:3c58a37c0da250849db2d99993bcf4723792b56d0e7820f62fb725afd379ba58 -->

- Checkout/session/link/intro records have no client write access. Cookie-bearing checkout/session/account-binding requests reject cross-origin and sibling-subdomain calls before claiming a purchase. Existing profile and Hub restaurant permissions and schema validators remain in place.

<!-- /coderabbit-ai-generated:v1 -->
<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:e7189398f563f31ded4b9cdd419f2ff204757cfdb0458c0d71ab16d53feb1b46 -->

- The existing webhook remains authenticated and idempotent. Pre-account checkout events return a retryable 503 until ownership is linked, preserving the payment history event for RevenueCat retry without granting access. Linked checkout events resolve to their Firebase account and retain the original RevenueCat customer ID. Authorization always uses RevenueCat subscriber lookup rather than webhook history.

<!-- /coderabbit-ai-generated:v1 -->

I've set up prototype Security Rules to keep the data in Firestore safe. They are designed to be secure for owner-scoped Consumer data by requiring a server-written, expiring RevenueCat access record and retaining existing create/update validators. However, you should review and verify them before broadly sharing your app. If you'd like, I can help you harden these rules.

## Deployment sequence and verification

1. Reconcile the source: Vercel currently deploys newer `tazzy-max/mealsmatess` work; this connected repository is `tazlol0909-maker/mealsmatess`. Apply this patch on top of the current production source before rollout. Publishing this older snapshot directly would replace newer work.
2. Configure the existing RevenueCat keys and Firebase Admin identity in the correct Vercel project/environment. Verify that the three intended store packages and eligible seven-day offer exist.
3. Review and deploy the updated Firestore rules with the server/UI rollout. Missing access records deny protected direct SDK reads; do not publish these rules alone against the old app. Use a maintenance window or coordinated cutover to avoid locking existing subscribers out of catalog/personal data.
4. Deploy the reconciled Consumer app to the existing `mealsmates.site` project and release a wrapper built after `bunx cap sync android`. Preserve Hub project attachments, DNS and all existing subdomains.
5. On an Android device installed through a Google Play internal test track with an authorized license tester: fresh install → four intro screens → paywall → cancel remains blocked → eligible trial/purchase → server confirmation → existing Google/email sign-in → app. Relaunch must omit the intro. Inspect RevenueCat `premium` under the expected linked identity.
6. Restore on a reinstall/second device using the same store and Firebase accounts; confirm no second charge. Repeat for an existing Firebase-UID subscriber, an ineligible trial account, Family plan, purchase failure, offline connection, expiration and refunds. Verify Google redirect return in the deployed Android wrapper. An emulator without Play billing is insufficient proof.
7. Repeat browser checkout/restore-by-account at the deployed web domain, inspect renewal terms and test direct `/planner`, `/recipes` and `/chat` links while unpaid. Check Hub sign-in/orders independently.

Local commands: `bun run test`, `bunx tsc --noEmit`, `bun run build`, `node scripts/smoke-vercel.mjs`, and `bun run test:rules` (Java 21 required). Android wrapper compilation uses SDK 36 and Java 21. See the task validation record for actual outcomes; real checkout and production/device validation remain pending.
