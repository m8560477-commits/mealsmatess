# MealMate Refined

Continue working on my existing MealMate GitHub project. Do not create a new project, copy the app, or reset the backend. Preserve all existing users, database data, authentication, UI, and functionality. Clerk must NOT be used anywhere. Keep the existing working Lovable Cloud authentication system and remove only any remaining Clerk configuration or references. Continue improving and completing the existing MealMate app without redesigning it. Use the existing GitHub code as the source of truth and make all changes directly to that project. https://github.com/taz2011tazz-cmyk/meal-genie-bot-73.git

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://mealsmates.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/dd870fee-2eb6-4c9c-aeed-a4bb526e7cf6).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Vercel deployment

The production app is https://mealsmates.site. The Vite build uses
Nitro's Vercel preset.

The daily Vercel cron remains compatible with Hobby deployments. Timed notifications
use the added GitHub Actions scheduler every five minutes once `MEALMATE_CRON_SECRET`
is configured to match the production `CRON_SECRET` and the workflow reaches the
default branch. GitHub may delay scheduled runs. For tighter timing or larger volumes,
use a dedicated authenticated scheduler. See [notification deployment](docs/notifications.md).

After building with the public Firebase web settings, run
`node scripts/smoke-vercel.mjs` to check the packaged function in isolation.
It verifies home-page rendering and unauthenticated JSON responses from the AI
routes without Firebase Admin or AI credentials. The isolated copy prevents
workspace dependencies from hiding missing deployment packages.

### Recipe photo storage

Generated recipe photos are uploaded server-side to a **public Vercel Blob**
store. In the mealsmates project's Storage tab, create or connect a public Blob
store for Production and Preview, then redeploy so its credentials are available.
The SDK uses the connected `BLOB_STORE_ID` with Vercel OIDC, or the server-only
`BLOB_READ_WRITE_TOKEN`. Never prefix the token with `VITE_`.

Firebase continues to store recipe records, including each photo's Blob URL.
Existing stored photos and bundled curated photos remain readable. New photos
are generated only by explicit actions and reused from the saved recipe URL.
The admin Image storage + retrieval diagnostic checks a temporary Blob upload,
public retrieval, and cleanup without calling the image model.
