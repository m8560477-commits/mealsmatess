# MealMate notification delivery

## Implementation

The existing notification centre and admin announcement studio now share a server-owned outbox. Categories are independently controlled. Health, recipes, planner, pantry/shopping and promotions require opt-in. Push defaults off. Account notices remain in the in-app history. No lock-screen payload contains private account, meal or health details.

Android uses Capacitor Push Notifications 8.1.3 and the existing Firebase project `mealmate-d2e53`. Permission is requested only when enabling push. Registration creates Meal Planning, Recipes, Dining and Account channels. Foreground updates refresh the bell, taps use an internal route allowlist, and current tokens are refreshed on app visibility. Tokens are hash-keyed, assigned transactionally to one authenticated user, removed on logout when connected, and invalidated on permanent FCM rejection. Logout remains available offline; generic private-safe push text protects stale-device notifications and the next registration transfers ownership.

Every event has a deterministic ID. Clearing notifications keeps a tombstone, preventing repeated delivery. Pending delivery respects IANA time zones, quiet hours, an hourly gap and four pushes per local day. Stale queued pushes expire after 48 hours; the history remains readable. Claim-before-send prevents automatic repeated sends after ambiguous network errors. Explicit FCM transient rejections can be retried by an admin for only the rejected devices. FCM acceptance is not proof of device display. A worker crash after claiming can leave an attempted, unconfirmed delivery; it is intentionally not blindly resent.

## Real events

- Local-date planner digest at the selected time; weekly planning suggestion when no Sunday meals exist.
- Unchecked shopping-list reminder and pantry dates saved through the new optional expiry-date input.
- Weekly saved-recipe reminder; recent recipe recommendations only when stored dietary tags match all saved restrictions. No claim of allergen safety.
- Optional check-in against an actual saved food goal.
- Authenticated RevenueCat billing events, verified independently against the configured entitlement.
- Authorized admin campaigns for all eligible consumers, verified paid subscribers, active trials, selected existing emails/UIDs, or existing healthy-interest criteria. Category preferences apply to every audience.

No invented restaurant promotions/bookings, security events, hydration logs, allergen changes or health summaries are generated. These require trustworthy event producers/data not currently present.

## Admin control centre

Admin → Push Notifications extends the existing studio. It supports drafts, schedule/edit/cancel, confirmation before sending, selected recipients, validated recipe slugs and other internal destinations, in-app/Android privacy previews, history and FCM outcome counts. Metrics cover the latest 100 campaigns and include delayed queue processing. Read counts are separate from push acceptance. Every server function checks the existing server-controlled `user_roles` collection. Client-side flags cannot grant permission. New collections inherit existing deny-all Firestore rules; users can only read their own notification history.

## Deployment required

1. Supply the existing project's Android `google-services.json` at `android/app/google-services.json`. Its package must be `com.taztechnologies.mealmate`; do not create or switch Firebase projects. Enable FCM HTTP v1 for the project and grant the existing server service account messaging access.
2. Configure server-only `FIREBASE_SERVICE_ACCOUNT_JSON`, project/database/bucket configuration already required by the app, `CRON_SECRET`, and HTTPS `MEALMATE_APP_URL`. Web push also needs public `VITE_FIREBASE_VAPID_KEY` and existing public Firebase configuration.
3. Deploy Firestore indexes in `firestore.indexes.json`. Existing server-only collections remain denied to client writes.
4. The existing daily `vercel.json` cron remains Hobby-compatible. Enable `.github/workflows/notifications.yml` on the default branch and set repository secret `MEALMATE_CRON_SECRET` to the same value as production `CRON_SECRET`. It invokes the protected endpoint every five minutes without an open browser. GitHub schedules are best-effort and can be delayed; use a dedicated authenticated scheduler (or minute-level Vercel cron on a supported plan) where stricter timing is required. The daily fallback alone cannot meet selected reminder times. No secrets were invented, paid plan purchased, or deployment performed.
5. Workers process 25 user profiles per invocation with a persisted cursor; campaign batches are also 25 recipients. Delivery can be later than the selected time depending on account volume, quiet hours and provider/device availability. Monitor scheduler failures and scale workers before high-volume deployment.
6. Run `bunx cap sync android`, rebuild/release the APK, and deploy the web app to the URL in `capacitor.config.ts` (currently `https://mealsmates.site`). Building an APK alone does not publish the modified web application.

## Required device acceptance test (blocked in this sandbox)

Use an authorized test admin and Android 13+ test device with Google Play Services. Sign in as a synthetic test recipient, enable push, confirm system permission and channels, then send a selected-user campaign. Check in-app receipt, FCM acceptance, foreground notification, background/closed display, and tap destination separately. Test denied permission, category opt-out, quiet-hour deferral, logout/account switching, stale token rejection, cancel/edit schedule and transient retries. Never report confirmed display without observing it on the device.
