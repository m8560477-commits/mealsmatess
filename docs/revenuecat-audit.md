# RevenueCat implementation and audit

## Bugs found and fixed

- No RevenueCat native SDK or purchase/restore flow existed. Added `@revenuecat/purchases-capacitor` 13.7.5, authenticated Firebase UID initialization, account switching, real offerings, purchase and restore calls.
- Paywall showed converted static prices, contradictory savings, a guaranteed three-day trial, and six-member family sharing. It now renders store package titles/prices/periods and lets Google Play confirm eligible offers. Family sharing is absent and is explicitly unavailable; no family entitlement is sold as implemented.
- A paid subscription row with missing `period_end` unlocked premium indefinitely. All server premium gates now resolve the configured RevenueCat entitlement through the subscriber API. Paid client flags and webhook product-name guesses cannot grant access. Verified lifetime entitlement is allowed only when RevenueCat explicitly returns null expiry for the expected entitlement. Cached verification lasts at most five minutes and cannot extend a finite expiration. Explicit grace-period dates preserve access.
- Webhook claims were not atomic, event ordering could overwrite current status, currency values were incorrectly labelled USD, and retries could duplicate side effects. Claims/payment records now use deterministic event IDs, verified current entitlement drives the projection, non-USD payments remain in original currency, referral grants are transactional, and private billing notices are deduplicated. Production/sandbox events are separated by deployment setting.
- Admin grants accepted UUID-only IDs (incompatible with ordinary Firebase UIDs) and overwrote paid subscriptions. Grants now accept a UID or normalized email, require server admin authorization, and live in separate expiring/revocable collections. Email grants require Firebase email verification. Existing finite manual grants remain supported. Promo/referral extensions select only their own manual records.

## Deployment gate

Do not merge this billing migration into production until `REVENUECAT_ENTITLEMENT_ID` and `REVENUECAT_SECRET_API_KEY` are configured and live subscriber verification succeeds. Missing configuration produces an explicit verification error; free usage remains available, but paid access is never inferred from an untrusted legacy row. This sandbox cannot verify production secret configuration, so production launch remains blocked pending that check.

## Configuration required

Keep the existing Firebase project and Android application `com.taztechnologies.mealmate`.

- `VITE_REVENUECAT_ANDROID_API_KEY`: the public `goog_` SDK key from the existing RevenueCat Android app. No secret key belongs in a `VITE_` variable.
- `VITE_REVENUECAT_OFFERING_ID`: optional exact existing offering; otherwise use RevenueCat's current offering.
- `REVENUECAT_ENTITLEMENT_ID`: exact configured premium entitlement identifier, server-side.
- `REVENUECAT_SECRET_API_KEY`: server-only credential authorized for the V1 subscriber API.
- `REVENUECAT_WEBHOOK_SECRET`: configure the matching bearer authorization in RevenueCat for `/api/public/webhooks/revenuecat`.
- `REVENUECAT_ENVIRONMENT`: PRODUCTION by default; SANDBOX only in the dedicated license-tester deployment.
- `VITE_REVENUECAT_FAMILY_PACKAGE_ID`: exact family package identifier to exclude if its name does not identify it as a family package. Family sharing must be implemented before selling that benefit.

Confirm in RevenueCat/Google Play that the real monthly, annual and family products are configured for the requested R199/month, R1,499/year and R299/month. These prices and product IDs could not be inspected here and are never inserted as invented products. Confirm the seven-day trial in the actual Play base plan/offer and test account eligibility. Release the native plugin build and deploy the updated web code to the configured Capacitor server URL.

## Verification status

Automated tests use explicit synthetic boundary fixtures. They verify code paths, not provider configuration or a real purchase. No purchase or production campaign was submitted.

| Requested test | Result | Evidence / required next step |
|---|---|---|
| RevenueCat SDK initialization | BLOCKED live | SDK wrapper tests pass; actual `goog_` key and Android test device required |
| Offerings and products | BLOCKED live | Empty-offering/error/store-price mapping tests pass; existing project and Play product access required |
| Google Play purchase | BLOCKED | No device, license-tester account or configured offerings |
| Seven-day trial eligibility | BLOCKED | Inspect actual Play offers and eligible/ineligible test accounts |
| Premium entitlement | PASS automated / BLOCKED live | Exact ID, expiration, malformed data and grace policy tested; live subscriber API credentials required |
| Restore purchases | PASS wrapper / BLOCKED live | SDK restore and account switching tested with synthetic fixtures; real purchase history required |
| Renewal and expiration handling | PASS automated / BLOCKED live | Dedup, retry and cancellation/access policy covered; live webhook lifecycle required |
| Family membership | FAIL — feature absent | No invitation/membership/access-sharing implementation; removed unsupported paywall claims |
| Admin premium whitelist | PASS policy / BLOCKED live | Expiry/revocation policy tested; authenticated Firebase admin + verified-email test accounts required for end-to-end |
| Android build | PASS | Debug APK built with both native plugins; does not prove Play billing or FCM runtime setup |

A suitable device acceptance run must cover purchase, cancellation, renewal, grace, expiration, restore, restart, account switching and admin-grant removal without charging a real customer. Use Google Play license testers and RevenueCat sandbox records only.
