import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { unzipSync } from "fflate";

const name = "vosk-model-small-en-us-0.15";
const sourceHash = "30f26242c4eb449f948e42cb302dd7a686cb29a3423a8367f99ff41780942498";
const sourceUrl = `https://alphacephei.com/vosk/models/${name}.zip`;
const directory = path.resolve("public/mia");
const output = path.join(directory, `${name}.tar.gz`);
const stamp = `${output}.json`;
const hash = (buffer) => createHash("sha256").update(buffer).digest("hex");
if (existsSync(output) && existsSync(stamp)) {
  const metadata = JSON.parse(await readFile(stamp, "utf8"));
  if (metadata.sourceHash === sourceHash && metadata.archiveHash === hash(await readFile(output))) {
    console.log("Mia offline voice model is ready.");
    process.exit(0);
  }
}
await mkdir(directory, { recursive: true });
const cache = path.resolve("node_modules/.cache/mealmate-voice");
await mkdir(cache, { recursive: true });
const cachedZip = path.join(cache, `${name}.zip`);
const supplied = process.argv[2];
let zip;
if (supplied) zip = await readFile(supplied);
else if (existsSync(cachedZip)) zip = await readFile(cachedZip);
else {
  console.log("Downloading the pinned 40 MB English voice model for same-origin hosting…");
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(360_000) });
  if (!response.ok) throw new Error(`Voice model download failed: HTTP ${response.status}`);
  zip = Buffer.from(await response.arrayBuffer());
}
if (hash(zip) !== sourceHash)
  throw new Error("Voice model checksum mismatch. Refusing to package it.");
await writeFile(cachedZip, zip);
const staging = await mkdtemp(path.join(tmpdir(), "mealmate-voice-"));
try {
  const entries = unzipSync(zip);
  for (const [relative, bytes] of Object.entries(entries)) {
    if (
      !relative.startsWith(`${name}/`) ||
      relative.split("/").includes("..") ||
      relative.includes("\\")
    ) {
      throw new Error("Unexpected voice archive path");
    }
    const destination = path.join(staging, relative);
    if (relative.endsWith("/")) await mkdir(destination, { recursive: true });
    else {
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, bytes);
    }
  }
  const archive = path.join(staging, "voice.tar.gz");
  execFileSync("tar", [
    "--sort=name",
    "--mtime=@0",
    "--owner=0",
    "--group=0",
    "--numeric-owner",
    "-czf",
    archive,
    "-C",
    staging,
    name,
  ]);
  const archiveHash = hash(await readFile(archive));
  await copyFile(archive, `${output}.tmp`);
  await rename(`${output}.tmp`, output);
  await writeFile(stamp, JSON.stringify({ sourceHash, archiveHash }) + "\n");
  console.log("Packaged the verified offline voice model.");
} finally {
  await rm(staging, { recursive: true, force: true });
}
