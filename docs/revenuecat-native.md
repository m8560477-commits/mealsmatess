# Consumer Android subscriptions

This implementation targets the existing `tazzy-max/mealsmatess` checkout. It does
not reproduce the uncommitted implementation described in the external handoff.
Consumer web retains its existing behavior (this checkout has no Whop integration).
Android uses RevenueCat Capacitor 13.7.6 with Firebase UID as App User ID.

## Configuration

Configure the Consumer Vercel project `mealsmates`, serving `https://mealsmates.site`.
The previous GitHub URL redirects to `tazzy-max/mealsmatess`; reconnect Vercel's
GitHub installation to that repository. Keep Hub/Admin deployments separate.

Use the names in `.env.example`. `REVENUECAT_ANDROID_PUBLIC_KEY` must be a `goog_`
key from MealMate Consumer Android (`app275a251970`); `REVENUECAT_SECRET_API_KEY`
must be a server REST key beginning `sk_`. Legacy Vercel names
`REVENUECAT_SDK_KEY` and `REVENUECAT_API_KEY` are fallback names, not public Vite
variables. Only the public Android key, offering, allowlist and environment reach
the authenticated client. Missing/incorrect configuration disables store actions.

Set entitlement `MealMate Pro` and offering `default`. Import the actual Play
subscriptions, attach the entitlement and packages, and allowlist the exact
product identifiers returned by the Android SDK and subscriber REST API. Confirm
base-plan identifier mapping with an actual purchase before launch. Only monthly
and annual auto-renewing individual packages are displayed. Prepaid, installment,
lifetime and non-allowlisted packages are excluded. Do not allowlist family plans.
Displayed prices and introductory phases come from the store.

### Seven-day trial acquisition (2026-10-26)

New trial purchases require the actual eligible Google Play option to begin with
one zero-price seven-day (P7D) or one-week (P1W) phase, followed by paid phases.
The client filters offers and rechecks this before opening the store sheet.
This intentionally replaces acquisition through paid-only or differently sized
introductory offers. Existing paid access, restore and refresh keep their existing
server-verification contract. Configure the seven-day free-trial offer in Google
Play and import it through RevenueCat; UI text does not create an offer.

The Premium comparison page no longer lists the Free plan. This does not remove
existing server-side free quotas or revoke existing grants. Both advertised plans
show seven-day trial/payment requirements; website and Family checkout are not
configured. No card details are collected in MealMate. Android payment methods
are managed by Google Play and cannot be restricted to cards by this UI.
RevenueCat Web Billing would require a connected payment provider and actual
products with seven-day trials before website card checkout can be enabled.

Upload a dedicated authorized Play service-account JSON in RevenueCat and connect
Google developer notifications. Firebase Admin credentials are not Play credentials.
Set restore behavior to **Keep with original App User ID**.

Set a strong server-only webhook secret and configure RevenueCat to send
`Authorization: Bearer <secret>` to
`https://mealsmates.site/api/public/webhooks/revenuecat`.
The receiver retains production Google Play, Apple, Stripe and promotional event
handling, using authoritative subscriber REST verification and the explicit product
allowlist for all of them. Test Store, sandbox and unsupported stores do not change
production access, payments or referral rewards. This replaces the old receiver's
direct event-to-access mapping. The new native purchase UI is Android-only.

## Access and account behavior

Purchase, restore and identity changes are serialized. Operations check the
current Firebase account before and after awaited work. Account changes discard
stale results. Client CustomerInfo never grants access. Preflight verifies current
provider state and checks all active grants to prevent duplicate subscriptions.
Purchases require acknowledgement of Terms and displayed renewal prices; restore
and refresh do not. There is no global legal-version acceptance system in this
checkout; the new preflight carries billing terms version `2026-10-25` only.

Server verification requires the original Firebase UID, approved entitlement and
product, recognized store, configured environment and finite matching expiration/grace
periods. Refunds and expired records do not grant access. SANDBOX records never
grant live Premium. REST failures preserve the prior record and return a retryable
error. Refresh and webhook sync use a per-user RevenueCat row in the existing
`subscriptions` collection and transaction ordering. Legacy RevenueCat rows are
retired on successful verification; manual/promo and other provider rows are
preserved. Webhook payment/referral processing is transactional and idempotent,
independent of whether access was refreshed first. Non-USD amounts are recorded as
local amounts, not mislabeled USD.

## Build and release

`bun install --frozen-lockfile`, `bunx cap sync android`, then build a new Android
binary. Both Capacitor's URL and bundled fallback use `https://mealsmates.site`.
Deploy matching UI/backend first. An existing binary without the RevenueCat plugin
cannot gain native billing from a hosted update. This task does not create an iOS
project or distribute a release. Replace the pre-existing committed release signing
configuration through an approved secure signing process before publishing.

## Required live verification

1. Confirm Play package `com.taztechnologies.mealmate`, subscriptions and base plans.
2. Verify localized offers, trials and identifier mapping on a Play testing track.
3. Purchase and restore with the original account; verify a second account cannot
   claim access, and account switching during a purchase does not grant another UID.
4. Verify pending/cancelled purchase, cancellation without immediate loss of the
   paid period, renewal, grace, expiry and refund through REST and webhook delivery.
5. Replay webhooks and reverse delivery order; payments/referrals must remain once.
6. Confirm webhook authentication, disabled/missing configuration and provider
   errors fail safely. Test sandbox separately from production access.
