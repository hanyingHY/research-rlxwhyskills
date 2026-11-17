#!/usr/bin/env node
/**
 * Download a relocatable CPython for a target platform from
 * python-build-standalone and unpack it in the layout prepare-runtime expects.
 *
 *   node scripts/fetch-python.mjs                        # current host target
 *   node scripts/fetch-python.mjs --target mac-arm64
 *   node scripts/fetch-python.mjs --target win-x64 --release 20250115
 *   node scripts/fetch-python.mjs --url <tar.gz> --sha256 <digest>
 *
 * The interpreter is executed only when the target matches the build host;
 * cross downloads are recorded but explicitly left unverified.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { download, getJson, githubHeaders } from "./lib/download.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const PYTHON_SERIES = process.env.PYTHON_SERIES || "3.12";

const TRIPLES = {
  "linux-x64": "x86_64-unknown-linux-gnu",
  "linux-arm64": "aarch64-unknown-linux-gnu",
  "mac-x64": "x86_64-apple-darwin",
  "mac-arm64": "aarch64-apple-darwin",
  "win-x64": "x86_64-pc-windows-msvc",
  "win-arm64": "aarch64-pc-windows-msvc",
};

function parseArgs(argv) {
  const OS_NAMES = { darwin: "mac", win32: "win", linux: "linux" };
  const options = {
    target: `${OS_NAMES[process.platform]}-${process.arch}`,
    out: join(ROOT, "runtime", "dist", ".python"),
  };
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
  console.error(`fetch-python: ${message}`);
  process.exit(1);
}

const options = parseArgs(process.argv.slice(2));
const triple = TRIPLES[options.target];
if (!triple) fail(`Unsupported --target ${options.target}; use one of ${Object.keys(TRIPLES).join(", ")}`);

let url = options.url;
if (!url) {
  const release = options.release
    ? await getJson(
        `https://api.github.com/repos/astral-sh/python-build-standalone/releases/tags/${encodeURIComponent(options.release)}`,
        githubHeaders(),
      )
    : await getJson(
        "https://api.github.com/repos/astral-sh/python-build-standalone/releases/latest",
        githubHeaders(),
      );
  const pattern = new RegExp(`^cpython-${PYTHON_SERIES}\\.\\d+.*-${triple}-install_only\\.tar\\.gz$`);
  const asset = (release.assets ?? []).find((candidate) => pattern.test(candidate.name));
  if (!asset) {
    fail(
      `no ${PYTHON_SERIES} install_only build for ${triple} in ${release.tag_name}. ` +
        "Pass --url with a specific archive.",
    );
  }
  url = asset.browser_download_url;
  console.log(`fetch-python: ${release.tag_name} ${asset.name}`);
}

const archiveName = url.split("/").pop();
const archive = join(ROOT, "runtime", "downloads", archiveName);
const digest = await download(url, archive, { expectedSha256: options.sha256 ?? null });

const unpacked = join(options.out, options.target);
rmSync(unpacked, { recursive: true, force: true });
mkdirSync(unpacked, { recursive: true });
const tar = spawnSync("tar", ["-xzf", archive, "-C", unpacked, "--strip-components=1"], {
  stdio: "inherit",
});
if (tar.status !== 0) fail(`could not extract ${archive}`);

// python-build-standalone's install_only archives contain a top-level python/.
const candidates = ["python", "."].map((entry) => join(unpacked, entry));
const root = candidates.find((candidate) =>
  process.platform === "win32"
    ? existsSync(join(candidate, "python.exe"))
    : existsSync(join(candidate, "bin", "python3")),
);
if (!root) {
  const listing = readdirSync(unpacked).slice(0, 10).join(", ");
  fail(`archive has no python/ interpreter layout (found: ${listing})`);
}

const finalRoot = join(options.out, `${options.target}-python`);
rmSync(finalRoot, { recursive: true, force: true });
cpSync(root, finalRoot, { recursive: true, dereference: false });

const interpreter =
  process.platform === "win32" ? join(finalRoot, "python.exe") : join(finalRoot, "bin", "python3");
const OS_FROM_TARGET = { mac: "darwin", win: "win32", linux: "linux" };
const [targetOs, targetArch] = options.target.split("-");
const sameHost = OS_FROM_TARGET[targetOs] === process.platform && targetArch === process.arch;

mkdirSync(join(ROOT, "runtime", "downloads"), { recursive: true });
console.log(`fetch-python: runtime/dist/.python/${options.target}-python`);
console.log(`fetch-python: sha256 ${digest.sha256 ?? "(reused)"}`);
if (sameHost) {
  const version = spawnSync(interpreter, ["--version"], { encoding: "utf8" });
  if (version.status !== 0) fail(`downloaded interpreter does not run: ${version.stderr}`);
  console.log(`fetch-python: ${version.stdout.trim() || version.stderr.trim()} (verified on this host)`);
} else {
  console.log("fetch-python: cross-downloaded; version can only be verified on the target OS");
}
console.log(
  `fetch-python: next -> npm run prepare:runtime -- --python runtime/dist/.python/${options.target}-python ...`,
);
