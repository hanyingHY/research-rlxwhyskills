#!/usr/bin/env node
/**
 * Assemble the per-platform runtime payload consumed by the packaged shell.
 *
 *   node scripts/prepare-runtime.mjs \
 *     --python /opt/cpython-3.12.7-x86_64-unknown-linux-gnu \
 *     --wheels dist/wheels \
 *     --ffmpeg /usr/local/bin \
 *     --target linux-x64
 *
 * Inputs:
 *   --python   relocatable CPython directory (python-build-standalone layout)
 *   --wheels   directory of target-platform wheels, including opendirector and
 *              the bundled OpenCode binary package for that target
 *   --ffmpeg   directory containing ffmpeg and ffprobe (or .exe on Windows)
 *   --target   <platform>-<arch>; defaults to this host and must match it unless
 *              --cross is given, because the result cannot be executed here
 *
 * Output:
 *   runtime/dist/<target>/python/...          interpreter
 *   runtime/dist/<target>/site-packages/...   installed dependencies
 *   runtime/dist/<target>/bin/ffmpeg|ffprobe  media tools
 *   runtime/dist/<target>/bin/opencode        bundled agent (when present)
 *   runtime/dist/<target>/host_entry.py       desktop Host
 *   runtime/dist/<target>/manifest.json       versions and file inventory
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function parseArgs(argv) {
  const OS_NAMES = { darwin: "mac", win32: "win", linux: "linux" };
  const options = {
    cross: false,
    target: `${OS_NAMES[process.platform]}-${process.arch}`,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--cross") {
      options.cross = true;
      continue;
    }
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`Missing value for ${argument}`);
    options[argument.slice(2)] = value;
    index += 1;
  }
  return options;
}

function fail(message) {
  console.error(`prepare-runtime: ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error) throw new Error(`${command} failed: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited ${result.status}\n${result.stdout ?? ""}${result.stderr ?? ""}`,
    );
  }
  return (result.stdout ?? "").trim();
}

function interpreterIn(pythonRoot, platform) {
  return platform === "win32"
    ? join(pythonRoot, "python.exe")
    : join(pythonRoot, "bin", "python3");
}

function filesUnder(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(path));
    else found.push(path);
  }
  return found;
}

const options = parseArgs(process.argv.slice(2));
if (!options.python || !options.wheels) {
  fail("--python and --wheels are required (see the header of this file)");
}
const [targetOs, targetArch] = options.target.split("-");
const TARGET_PLATFORMS = { mac: "darwin", win: "win32", linux: "linux" };
const targetPlatform = TARGET_PLATFORMS[targetOs];
if (!targetPlatform || !targetArch) {
  fail(`Unsupported --target ${options.target}; use mac|win|linux-<arch>`);
}
if (!options.cross && (targetPlatform !== process.platform || targetArch !== process.arch)) {
  fail(
    `Refusing to build ${options.target} on ${process.platform}-${process.arch}: ` +
      "use a matching host or pass --cross, and remember the result is unverified.",
  );
}

const output = resolve(options.out ?? join(ROOT, "runtime", "dist", options.target));
const pythonSource = resolve(options.python);
const wheelSource = resolve(options.wheels);
const ffmpegSource = options.ffmpeg ? resolve(options.ffmpeg) : null;

if (!statSync(pythonSource).isDirectory()) fail(`--python must be a directory, got ${pythonSource}`);
if (!statSync(wheelSource).isDirectory()) fail(`--wheels must be a directory, got ${wheelSource}`);

console.log(`prepare-runtime: target ${options.target}`);
console.log(`prepare-runtime: output ${output}`);
rmSync(output, { recursive: true, force: true });
mkdirSync(join(output, "bin"), { recursive: true });

const pythonRoot = join(output, "python");
cpSync(pythonSource, pythonRoot, { recursive: true, dereference: false });
const python = interpreterIn(pythonRoot, targetPlatform);
if (!existsSync(python)) {
  fail(`Copied Python has no interpreter at ${python}. Check the archive layout.`);
}

const sitePackages = join(output, "site-packages");
const pipArguments = [
  "-m",
  "pip",
  "install",
  "--no-index",
  "--find-links",
  wheelSource,
  "--target",
  sitePackages,
  "--no-compile",
  "opendirector",
];
if (options.cross) {
  if (!options["pip-platform"]) {
    fail("Cross builds need --pip-platform <manylinux tag>; pip cannot infer it from the app target");
  }
  pipArguments.push(
    "--only-binary=:all:",
    "--platform",
    options["pip-platform"],
    "--python-version",
    options["pip-python-version"] ?? "3.12",
    "--implementation",
    "cp",
  );
}
console.log(`prepare-runtime: ${python} ${pipArguments.join(" ")}`);
run(python, pipArguments);

const media = targetPlatform === "win32" ? ["ffmpeg.exe", "ffprobe.exe"] : ["ffmpeg", "ffprobe"];
for (const name of media) {
  const source = ffmpegSource ? join(ffmpegSource, name) : null;
  if (!source || !existsSync(source)) {
    fail(
      ffmpegSource
        ? `Missing ${name} in ${ffmpegSource}`
        : "Pass --ffmpeg <dir> with ffmpeg and ffprobe; media export depends on them",
    );
  }
  cpSync(source, join(output, "bin", name));
}

// Optional: the bundled agent binary produced by the OpenDirector wheel build.
const bundledAgent = join(sitePackages, "opendirector", "_bundled", "bin");
if (existsSync(bundledAgent)) {
  for (const name of readdirSync(bundledAgent)) {
    cpSync(join(bundledAgent, name), join(output, "bin", name));
  }
}

cpSync(join(ROOT, "runtime", "host_entry.py"), join(output, "host_entry.py"));

const env = {
  ...process.env,
  PYTHONPATH: sitePackages,
  PYTHONNOUSERSITE: "1",
  PYTHONDONTWRITEBYTECODE: "1",
};
const pythonVersion = run(python, ["-c", "import sys; print(sys.version.split()[0])"], { env });
const distributionVersion = run(
  python,
  ["-c", "from importlib.metadata import version; print(version('opendirector'))"],
  { env },
);
const imports = run(
  python,
  [
    "-c",
    "import opendirector, opendirector_api; print('ok')",
  ],
  { env },
);
if (imports !== "ok") fail("Bundled Python cannot import opendirector and opendirector_api");

const binFiles = Object.fromEntries(
  readdirSync(join(output, "bin")).map((name) => [
    name,
    statSync(join(output, "bin", name)).size,
  ]),
);
const manifest = {
  schemaVersion: 1,
  target: options.target,
  createdAt: new Date().toISOString(),
  versions: {
    python: pythonVersion,
    opendirector: distributionVersion,
    ...(existsSync(join(output, "bin", "ffmpeg"))
      ? { ffmpeg: run(join(output, "bin", "ffmpeg"), ["-version"]).split("\n")[0] }
      : {}),
    ...(existsSync(join(output, "bin", "ffmpeg.exe"))
      ? { ffmpeg: run(join(output, "bin", "ffmpeg.exe"), ["-version"]).split("\n")[0] }
      : {}),
  },
  bin: binFiles,
  fileCount: filesUnder(output).length,
};
writeFileSync(join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`prepare-runtime: wrote ${join(output, "manifest.json")}`);
console.log(
  `prepare-runtime: python ${pythonVersion}, opendirector ${distributionVersion}, ` +
    `${manifest.fileCount} files`,
);
console.log("prepare-runtime: next -> node scripts/verify-runtime.mjs --runtime " + output);
