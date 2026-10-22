# MealMate scanner

`/scan` supports food/meal photos, visible ingredients, readable recipe text, and product barcodes. It uses the existing app shell, Firebase authentication, AI gateway, AI plan allowance and personal pantry/planner collections. No new package is required.

## Camera and input

- The live preview uses `getUserMedia({ video, audio: false })` inside MealMate. The browser/Capacitor requests camera permission; no external camera or Lens intent is launched.
- Android declares `CAMERA`, with camera hardware optional. Capacitor's existing WebChromeClient requests the runtime permission. Use an updated Android System WebView and HTTPS.
- Camera tracks are stopped on capture, cancel, mode change, unmount, hidden pages and late permission grants. Flashlight control is shown only when the active track reports torch support.
- Photo selection accepts JPEG, PNG and WebP up to 12 MB. Images are decoded and resized to at most 1600 pixels on the longest edge; uploads are bounded below 2.9 MB. HEIC, unreadable files and unready video frames receive an in-app error.
- Native `BarcodeDetector` is used when available. Supported device formats include EAN-8/13, UPC-A, ITF and QR. Product checksums must be valid. A GS1 Digital Link QR can supply a GTIN; its URL is never opened or fetched. Arbitrary QR links are unsupported. Manual EAN/UPC/GTIN entry works without barcode detection.

## Actual analysis stages

`POST /api/scan` authenticates Firebase bearer tokens, bounds input, applies the existing vision rate limit and charges the existing AI plan allowance only for image recognition. Barcode database lookup does not consume an AI credit. Image contents are checked before spending credits. API/provider secrets remain on the server.

The response is newline-delimited JSON. Events bracket real operations, with no timers or invented percentage progress:

1. **Reading scan:** decode the image or validate the product code.
2. **Identifying item:** call the existing MealMate AI engine for image recognition, or retrieve the exact product from Open Food Facts.
3. **Checking nutrition:** normalize available database nutrients/units or inspect returned AI estimates and their portion basis. This does not imply a separate nutrition database search for photos.
4. **Checking ingredients:** inspect ingredient evidence and available allergen/trace statements. Unknown allergens produce `needs attention`, never an allergen-free claim.
5. **Verifying results:** validate response structure, limits, missing values and numeric consistency. The UI explicitly states that these checks are not independent verification of food identity or safety.
6. **Preparing results:** validate and deliver the sourced result in MealMate.

Fast local checks may complete immediately; their final states and messages remain in analysis history. A failed operation does not mark subsequent checks completed. Cancellation aborts the request and provider signal. Client decoding/auth/upload/stream waits and provider/database calls are bounded. Retry keeps a successfully decoded capture; it starts a new request and may consume another AI allowance.

## Results and saves

- Photo nutrition and visible ingredients are labeled AI estimates/observations. Model confidence is shown only when supplied, without a default value. Recipe mode transcribes readable instructions rather than generating missing steps.
- Open Food Facts is a community-maintained database, not independently verified data. Values keep their per-100g/100ml reporting basis. The package serving size is displayed separately when supplied; no serving conversion is invented.
- Allergen information is limited to database statements or AI-transcribed explicit label statements. Missing information is shown as unknown. Users must check the actual package/recipe.
- Existing pantry and meal-plan actions use the same personal collection schema. Batched writes make a meal-plan entry and optional photo-portion nutrition log atomic. Barcode values are not silently logged as a consumed meal portion. Photo nutrition logging requires explicit selection.
- Recipe scans can add the name to the meal plan. They do not publish the transcription into the shared recipe catalog.

## Deployment and verification requirements

- Configure the existing public Firebase web settings and server-only `FIREBASE_SERVICE_ACCOUNT_JSON` for `mealmate-d2e53` / the configured Firestore database.
- Image recognition needs the existing Vercel AI Gateway configuration (local `AI_GATEWAY_API_KEY`, or Vercel OIDC), or the existing server-only `LOVABLE_API_KEY` path. The scanner does not change provider selection.
- Barcode lookup requires server outbound HTTPS to `world.openfoodfacts.org`; no food database API key is required.
- Keep streaming responses unbuffered. The route sends `Cache-Control: no-store, no-transform` and `X-Accel-Buffering: no`. Client parsing rejects incomplete or malformed streams.
- Deploy the updated web code to the origin loaded by the consumer app. `capacitor.config.ts` currently loads a remote HTTPS origin; building an APK alone does not deploy web changes. Run `bunx cap sync android`, then rebuild the Android app to include the new permission.
- Unit tests use synthetic fixtures only within `src/test/`. They cover errors, cancellation, input validation, camera lifecycle, transport, quota enforcement and save boundaries. They do not establish live AI accuracy or authenticated provider availability. Run a signed-in scan on a physical Android device with the configured backend before release.
