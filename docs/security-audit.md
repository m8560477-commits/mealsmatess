# Browser/API security audit

## Findings and changes

- Browser requests for AI and scanning go through authenticated MealMate server endpoints. AI provider keys, photo-provider keys, Firebase Admin credentials, FCM sends, RevenueCat subscriber verification and webhook secrets are server-only. No private provider API was found being called directly with a secret from the browser; none was moved merely to create an artificial change.
- Firebase Auth/Firestore client calls remain in the browser and are subject to Firebase security rules. Firebase web configuration and Web Push VAPID keys are public identifiers. Android purchases require RevenueCat's **public** `goog_` SDK key; secret API credentials remain on the server.
- Vite previously used environment-name prefixes. The build now exposes only an exact list of public variable names, so a similarly named private variable cannot accidentally ship. The exact public RevenueCat variables are included (they were missing from the older allowlist). A non-public RevenueCat SDK key causes the build to fail without printing the value.
- Browser Firestore error reporting included user email, UID, provider information and document paths. It now logs only an allowlisted error category/operation and displays a generic actionable message.
- The repository tracked `android/mealmate-release.keystore` and hardcoded signing passwords in Gradle. The keystore is removed from version control (the local file is preserved and ignored); Gradle now requires private build-environment signing configuration for releases. Debug builds remain supported.
- Privileged campaigns, token registration, billing verification and admin grants use existing authenticated server boundaries. Ordinary users cannot write notification history, campaigns, tokens, grants or entitlement snapshots through Firestore client rules.

## Required operational action

The old signing material still exists in published Git history. Removing it from the current source does not make it secret again. Review the Google Play signing setup and reset/rotate the exposed upload key where appropriate. Store replacement signing material in private CI secrets or a secure build environment. Do not rewrite shared repository history as part of this change.

Release build variables: `MEALMATE_KEYSTORE_PATH`, `MEALMATE_KEYSTORE_PASSWORD`, `MEALMATE_KEY_ALIAS`, `MEALMATE_KEY_PASSWORD`. Never put these in a VITE-prefixed variable, source file or client bundle.

## Scope and limits

Source-level API inventory, exact public-env tests, browser error-redaction tests and production bundle inspection are included in validation. This is not a penetration-test certification or proof of live Firebase rules deployment. Provider settings, production secrets, key rotation and physical-device security must be verified by the deployment owner. See the notification and RevenueCat documents for missing runtime configuration.
