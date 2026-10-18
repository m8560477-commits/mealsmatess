# MealMate Firebase setup

MealMate is configured for the Firebase project `mealmate-d2e53`. The browser app reads its public Firebase Web App configuration from these Vercel environment variables:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID` (must be `mealmate-d2e53`)
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID` (optional; Analytics is not required)
- `VITE_FIREBASE_FIRESTORE_DATABASE_ID` (optional; omit for the default database)

Add the same values to Vercel Development, Preview, and Production environments. These are Firebase Web App values and are safe to expose in a client bundle; never add a service-account JSON, private key, or admin credential to any `VITE_` variable.

The server also requires `FIREBASE_SERVICE_ACCOUNT_JSON` in Vercel Development, Preview, and Production. Set it to the Firebase Admin service-account JSON for project `mealmate-d2e53` as an encrypted server-only variable. It must be valid JSON with `project_id`, `client_email`, and `private_key`; do not prefix it with `VITE_`.

## Firebase Console checklist

1. In project `mealmate-d2e53`, register or select the MealMate Web App and copy its Web SDK configuration.
2. Authentication > Sign-in method: enable Email/Password and Google. Set the Google support email and add the deployed Vercel hostnames under Authentication > Settings > Authorized domains.
3. Firestore Database: create/use the intended database ID and deploy `firestore.rules` and any required indexes from the repository.
4. Storage: enable Firebase Storage for the same project and deploy the repository Storage rules if present.

The app fails fast when required public configuration is missing or when `VITE_FIREBASE_PROJECT_ID` is not exactly `mealmate-d2e53`, preventing accidental use of the retired project. Google sign-in and production access still require the Console settings above and must be tested against the intended project after the variables are added.
