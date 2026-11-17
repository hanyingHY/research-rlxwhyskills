#!/usr/bin/env node
/** Windows build orchestrator for the OpenDirector desktop client.
 *
 *   node scripts/build-windows.mjs            # build NSIS + portable + zip into release/
 *   node scripts/build-windows.mjs --dir      # unpacked directory only (a packaging check)
 *   node scripts/build-windows.mjs --skip-web # do not rebuild the workspace bundle
 *
 * The script only does what a clean checkout can do: typecheck, compile, then hand
 * over to electron-builder. The bundled Python runtime and the media tools are
 * prepared by scripts/windows/*.ps1 beforehand; if they are missing, the packaged
 * app still builds and the shell falls back to a system interpreter with a clear
 * message.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dirOnly = args.includes("--dir");

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { cwd: root, stdio: "inherit", shell: false, ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(" ")} failed (${result.status})`);
  }
}

function npm() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function reportResources() {
  const resources = path.join(root, "resources");
  const entries = [
    ["python-runtime", path.join(resources, "python-runtime")],
    ["wheels", path.join(resources, "wheels")],
    ["bin", path.join(resources, "bin")],
  ];
  for (const [name, directory] of entries) {
    const present = fs.existsSync(directory);
    console.log(`resource ${name}: ${present ? directory : "MISSING (the app will fall back to a system Python)"}`);
  }
  // electron-builder fails when an extraResources source does not exist.
  for (const [, directory] of entries) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function main() {
  console.log("OpenDirector desktop: Windows build");
  if (!fs.existsSync(path.join(root, "node_modules"))) {
    run(npm(), ["ci"]);
  }
  run(npm(), ["run", "typecheck"]);
  run(npm(), ["run", "build"]);
  reportResources();

  const builder = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "electron-builder.cmd" : "electron-builder");
  const builderArgs = ["--win", "--x64"];
  if (dirOnly) builderArgs.push("--dir");
  if (process.env.CI) builderArgs.push("--config.compression=store");
  run(builder, builderArgs);

  const release = path.join(root, "release");
  if (fs.existsSync(release)) {
    console.log("\nArtifacts:");
    for (const entry of fs.readdirSync(release).sort()) {
      const target = path.join(release, entry);
      if (fs.statSync(target).isFile()) {
        console.log(`  ${entry} (${(fs.statSync(target).size / 1024 / 1024).toFixed(1)} MiB)`);
      }
    }
  }
}

try {
  main();
} catch (error) {
  console.error(`\nBuild failed: ${error.message}`);
  process.exit(1);
}
