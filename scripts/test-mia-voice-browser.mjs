import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const browser = (args, input) =>
  JSON.parse(
    execFileSync("coderabbit-agent-browser", [...args, "--json"], { input, encoding: "utf8" }),
  );
// Requires the already-registered shared Preview service; never launch another browser.
browser(["open", "http://localhost:3000/premium"]);
browser(
  ["eval", "--stdin"],
  await readFile(new URL("./mia-browser-probe.js", import.meta.url), "utf8"),
);
const deadline = Date.now() + 100_000;
let result;
while (Date.now() < deadline) {
  result = browser(["eval", "window.miaVoiceProbe"]).data.result;
  if (result.phase === "done" || result.phase === "failed") break;
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
assert.equal(result.phase, "done", result.error ?? "Voice probe timed out");
assert.equal(result.questions.length, 2);
assert.equal(result.spoken.length, 2);
assert.equal(result.state, "muted");
console.log(
  JSON.stringify(
    { fixture: "synthetic WAV through real WASM; AI and TTS deterministic", ...result },
    null,
    2,
  ),
);
