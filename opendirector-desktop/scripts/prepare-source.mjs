#!/usr/bin/env node
/**
 * Fetch the exact upstream sources this desktop version is pinned to.
 *
 *   node scripts/prepare-source.mjs                 # tag v<package version>
 *   node scripts/prepare-source.mjs --ref v0.1.4
 *
 * Useful for development (`npm start` runs the Host from runtime/src/... when
 * no packaged runtime exists) and for auditing what a release contains.
 * Packaging does not need it: the Python wheel already bundles the web UI.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { download, githubHeaders, getJson } from "./lib/download.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const desktop = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

function parseArgs(argv) {
  const options = { ref: `v${desktop.version}`, out: join(ROOT, "runtime", "src") };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`Missing value for ${argument}`);
    options[argument.slice(2)] = value;
    index += 1;
  }
  return options;
}

function fail(message) {
  console.error(`prepare-source: ${message}`);
  process.exit(1);
}

const options = parseArgs(process.argv.slice(2));
const ref = options.ref;
const destination = resolve(options.out, `OpenDirector-${ref.replace(/^v/, "")}`);

if (existsSync(join(destination, "package.json")) && !process.env.OPENDIRECTOR_FORCE) {
  console.log(`prepare-source: already present at ${destination}`);
  process.exit(0);
}

rmSync(destination, { recursive: true, force: true });
mkdirSync(dirname(destination), { recursive: true });

// Resolve the ref to a commit so the fetch is reproducible and the log records
// exactly which sources were used.
let commit = ref;
try {
  const info = await getJson(
    `https://api.github.com/repos/ThinkFlowLab/OpenDirector/commits/${encodeURIComponent(ref)}`,
    githubHeaders(),
  );
  commit = info.sha;
} catch (error) {
  console.warn(`prepare-source: could not resolve ${ref} (${error.message}); using the ref name`);
}

const archive = join(ROOT, "runtime", "downloads", `OpenDirector-${ref}.tar.gz`);
await download(
  `https://codeload.github.com/ThinkFlowLab/OpenDirector/tar.gz/${encodeURIComponent(ref)}`,
  archive,
);

mkdirSync(destination, { recursive: true });
const extracted = spawnSync("tar", ["-xzf", archive, "-C", destination, "--strip-components=1"], {
  stdio: "inherit",
});
if (extracted.status !== 0) fail(`could not extract ${archive}`);

const upstream = JSON.parse(readFileSync(join(destination, "package.json"), "utf8"));
if (upstream.version !== desktop.version) {
  fail(
    `upstream ${ref} is version ${upstream.version} but this shell is ${desktop.version}; ` +
      "keep shell and bundled OpenDirector versions equal (see docs/02, decision 7)",
  );
}
console.log(`prepare-source: ${ref} (${commit.slice(0, 12)}) -> ${destination}`);
console.log(`prepare-source: upstream version ${upstream.version} matches desktop ${desktop.version}`);
console.log("prepare-source: next -> npm run prepare:runtime (needs a wheel set and a Python runtime)");
