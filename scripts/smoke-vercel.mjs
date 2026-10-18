import { cp, mkdtemp, rm, readdir, readFile } from "node:fs/promises";
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
  const serverFiles = await readdir(join(artifact, "_ssr"));
  const catalogFile = serverFiles.find((name) => name.startsWith("recipe-catalog.functions-"));
  if (!catalogFile) throw new Error("Recipe catalog is missing from the server artifact.");
  const catalogSource = await readFile(join(artifact, "_ssr", catalogFile), "utf8");
  const catalogFunctionIds = [
    catalogSource.match(/id: "([a-f0-9]+)",\s*name: "listRecipeCatalog"/)?.[1],
    catalogSource.match(/id: "([a-f0-9]+)",\s*name: "getRecipeCatalogEntry"/)?.[1],
  ];
  if (catalogFunctionIds.some((id) => !id)) throw new Error("Catalog function IDs are missing.");
  const authFunctions = [];
  for (const [prefix, names] of [
    ["premium-grants.functions-", ["getPremiumGrants", "getPremiumGrantHistory"]],
    ["preferences.functions-", ["getMyPreferences"]],
    ["onboarding.functions-", ["getOnboardingExperience"]],
    ["family.functions-", ["getMyFamily"]],
    ["premium.functions-", ["getMyEntitlement", "adminIsAdmin"]],
  ]) {
    const files = serverFiles.filter((name) => name.startsWith(prefix));
    if (!files.length) throw new Error(prefix + " missing from artifact");
    const source = (
      await Promise.all(files.map((file) => readFile(join(artifact, "_ssr", file), "utf8")))
    ).join("\n");
    for (const name of names) {
      const id = source.match(new RegExp('id: "([a-f0-9]+)",\\s*name: "' + name + '"'))?.[1];
      if (!id) throw new Error(name + " missing function ID");
      authFunctions.push(id);
    }
  }
  const result = spawnSync(
    process.execPath,
    [
      // Vercel's loader rejects CommonJS require() of ESM packages.
      "--no-experimental-require-module",
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
        for (const id of JSON.parse(process.argv[2])) {
          const response = await app.fetch(new Request('https://mealmate.test/_serverFn/' + id));
          assert.equal(response.status, 401, 'Server function must require authentication');
          console.log('Authenticated server function: 401');
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
      JSON.stringify([...catalogFunctionIds, ...authFunctions]),
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
