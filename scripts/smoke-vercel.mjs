import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

// Run the deployable function outside the checkout so workspace node_modules
// cannot hide dependencies missing from the Vercel artifact. Build first with
// the public VITE_FIREBASE_* settings; no Admin or AI credentials are needed.
const temporary = await mkdtemp(join(tmpdir(), "mealmate-vercel-smoke-"));
try {
  const artifact = join(temporary, "function");
  await cp(resolve(".vercel/output/functions/__server.func"), artifact, {
    recursive: true,
    dereference: true,
  });
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
        import assert from 'node:assert/strict';
        import { pathToFileURL } from 'node:url';
        const { default: app } = await import(pathToFileURL(process.argv[1]));
        for (const path of ['/api/mia', '/api/recipe-image']) {
          const response = await app.fetch(new Request('https://mealmate.test' + path, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
          }));
          assert.equal(response.status, 401, path + ' must reach its authentication handler');
          assert.match(response.headers.get('content-type'), /application\\/json/);
          assert.equal((await response.json()).error, 'Sign in to continue.');
          console.log(path + ': JSON 401');
        }
        const page = await app.fetch(new Request('https://mealmate.test/', {
          headers: { accept: 'text/html' },
        }));
        assert.equal(page.status, 200, 'Home must render');
        assert.match(await page.text(), /MealMate/);
        console.log('Home: HTML 200');
        // Firebase's background timers outlive this completed smoke check.
        process.exit(0);
      `,
      join(artifact, "index.mjs"),
    ],
    {
      cwd: temporary,
      env: { PATH: process.env.PATH, NODE_ENV: "production" },
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(temporary, { recursive: true, force: true });
}
