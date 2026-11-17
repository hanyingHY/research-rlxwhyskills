#!/usr/bin/env node
/**
 * Download ffmpeg + ffprobe for a target platform.
 *
 *   node scripts/fetch-ffmpeg.mjs                    # current host target
 *   node scripts/fetch-ffmpeg.mjs --target linux-x64
 *   node scripts/fetch-ffmpeg.mjs --from /usr/local/bin   # use local binaries
 *
 * Sources: BtbN/FFmpeg-Builds (Windows/Linux, GPL because libx264 is GPL) and
 * evermeet.cx (macOS, x86_64). Ship the licence text with the app; the desktop
 * README explains the GPL consequence for redistribution.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { download, getJson, githubHeaders } from "./lib/download.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const OS_NAMES = { darwin: "mac", win32: "win", linux: "linux" };
const BTBN_PLATFORM = {
  "win-x64": "win64",
  "win-arm64": "winarm64",
  "linux-x64": "linux64",
  "linux-arm64": "linuxarm64",
};

function parseArgs(argv) {
  const options = {
    target: `${OS_NAMES[process.platform]}-${process.arch}`,
    out: join(ROOT, "runtime", "dist", ".ffmpeg"),
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
  console.error(`fetch-ffmpeg: ${message}`);
  process.exit(1);
}

function unzip(archive, destination) {
  mkdirSync(destination, { recursive: true });
  // Windows runners expose Python as `python`; POSIX ones as `python3`.
  for (const python of ["python3", "python"]) {
    const result = spawnSync(python, ["-m", "zipfile", "-e", archive, destination], {
      stdio: "inherit",
    });
    if (result.status === 0) return;
    if (result.error?.code !== "ENOENT") break;
  }
  fail(`could not extract ${archive}; Python 3 is required to unpack zip`);
}

function findBinary(directory, name) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = findBinary(path, name);
      if (nested) return nested;
    } else if (entry.name === name) {
      return path;
    }
  }
  return null;
}

const options = parseArgs(process.argv.slice(2));
const targetOs = options.target.split("-")[0];
const isWindowsTarget = targetOs === "win";
const names = isWindowsTarget ? ["ffmpeg.exe", "ffprobe.exe"] : ["ffmpeg", "ffprobe"];
const destination = join(options.out, `${options.target}-bin`);

if (options.from) {
  mkdirSync(destination, { recursive: true });
  for (const name of names) {
    const source = join(options.from, name);
    if (!existsSync(source)) fail(`--from ${options.from} has no ${name}`);
    copyFileSync(source, join(destination, name));
    chmodSync(join(destination, name), 0o755);
  }
  console.log(`fetch-ffmpeg: copied host binaries -> ${destination}`);
  process.exit(0);
}

rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
const downloads = join(ROOT, "runtime", "downloads");
mkdirSync(downloads, { recursive: true });

if (targetOs === "mac") {
  // evermeet.cx ships x86_64 builds; Apple silicon runs them under Rosetta 2.
  for (const tool of ["ffmpeg", "ffprobe"]) {
    const archive = join(downloads, `evermeet-${tool}.zip`);
    await download(`https://evermeet.cx/ffmpeg/getrelease/${tool}/zip`, archive);
    const unpacked = join(downloads, `evermeet-${tool}`);
    rmSync(unpacked, { recursive: true, force: true });
    unzip(archive, unpacked);
    const binary = findBinary(unpacked, tool);
    if (!binary) fail(`evermeet archive for ${tool} had no ${tool}`);
    copyFileSync(binary, join(destination, tool));
    chmodSync(join(destination, tool), 0o755);
  }
  console.log("fetch-ffmpeg: macOS binaries are x86_64 (Rosetta 2 required on arm64)");
} else {
  const platform = BTBN_PLATFORM[options.target];
  if (!platform) fail(`no BtbN build for ${options.target}`);
  const release = await getJson(
    "https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest",
    githubHeaders(),
  );
  const asset = (release.assets ?? []).find((candidate) =>
    new RegExp(`^ffmpeg-master-latest-${platform}-gpl\\.zip$`).test(candidate.name),
  );
  if (!asset) fail(`no ${platform} GPL archive in ${release.tag_name}; pass --from <dir>`);
  const archive = join(downloads, asset.name);
  await download(asset.browser_download_url, archive);
  const unpacked = join(downloads, `btbn-${options.target}`);
  rmSync(unpacked, { recursive: true, force: true });
  unzip(archive, unpacked);
  for (const name of names) {
    const binary = findBinary(join(unpacked, "bin"), name) ?? findBinary(unpacked, name);
    if (!binary) fail(`${asset.name} had no ${name}`);
    copyFileSync(binary, join(destination, name));
    chmodSync(join(destination, name), 0o755);
  }
}

const size = names
  .map((name) => statSync(join(destination, name)).size)
  .reduce((total, bytes) => total + bytes, 0);
console.log(`fetch-ffmpeg: ${destination} (${(size / 1024 / 1024).toFixed(1)} MiB)`);
console.log("fetch-ffmpeg: next -> npm run prepare:runtime -- --ffmpeg " + destination + " ...");
