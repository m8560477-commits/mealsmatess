# MealMate Refined

Continue working on my existing MealMate GitHub project. Do not create a new project, copy the app, or reset the backend. Preserve all existing users, database data, authentication, UI, and functionality. Clerk must NOT be used anywhere. Keep the existing working Lovable Cloud authentication system and remove only any remaining Clerk configuration or references. Continue improving and completing the existing MealMate app without redesigning it. Use the existing GitHub code as the source of truth and make all changes directly to that project. https://github.com/taz2011tazz-cmyk/meal-genie-bot-73.git

This project was built with [Lovable](https://lovable.dev).

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:f97706128d6948a179bd74d4b0c4acc7c5a5435797be3ec6d2823e813a19db20 -->

**Live app**: https://mealsmates.site

<!-- /coderabbit-ai-generated:v1 -->

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

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:7e06f302c527216d07f6dc199813e4d2bb883454fe12363181d4d9415f887904 -->

The production Consumer app is **https://mealsmates.site**. The Vite build uses
Nitro's Vercel preset. Domain attachment, Firebase/Google callback settings, Hub
preservation, and Android release checks are documented in
[Production domain setup](docs/production-domain.md).

<!-- /coderabbit-ai-generated:v1 -->

The announcement processor runs once daily at midnight UTC (`0 0 * * *`),
compatible with Vercel Hobby. Scheduled announcements are delivered on the next
daily run, with Vercel's hourly timing window. For more frequent delivery, use a
Vercel plan that supports it before changing the cron schedule in `vercel.json`.
See [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

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
