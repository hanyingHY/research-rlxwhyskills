#!/usr/bin/env node
/**
 * Start the real Host from an assembled runtime and exercise it end to end:
 * dynamic port, token enforcement, health, status and graceful shutdown.
 *
 *   node scripts/verify-runtime.mjs --runtime runtime/dist/linux-x64 --data /tmp/od-verify
 *
 * For a source checkout without an assembled payload, point the same checks at
 * a virtualenv:
 *   node scripts/verify-runtime.mjs --runtime . --python .venv/bin/python \
 *     --host-entry runtime/host_entry.py --pythonpath ../packages/core/src:../apps/api/src
 *
 * This is the check that "dependency files alone do not establish a working
 * installation" asks for. Run it on every target OS/architecture before release.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { HostSupervisor } from "../src/host.js";
import { createLogger } from "../src/log.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) throw new Error(`Unexpected argument ${argv[index]}`);
    options[argv[index].slice(2)] = argv[index + 1];
    index += 1;
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
if (!options.runtime) {
  console.error("verify-runtime: --runtime <dir> is required");
  process.exit(1);
}

const runtime = resolve(options.runtime);
const platform = process.platform;
const python =
  options.python ??
  (platform === "win32"
    ? join(runtime, "python", "python.exe")
    : join(runtime, "python", "bin", "python3"));
const hostEntry = resolve(options["host-entry"] ?? join(runtime, "host_entry.py"));
const sitePackages = resolve(options.pythonpath ?? join(runtime, "site-packages"));
const data = resolve(options.data ?? join(ROOT, ".verify-data"));

for (const [label, path] of [
  ["interpreter", python],
  ["host entry", hostEntry],
]) {
  if (!existsSync(path)) {
    console.error(`verify-runtime: missing ${label} at ${path}`);
    process.exit(1);
  }
}

const manifestPath = join(runtime, "manifest.json");
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  console.log(`verify-runtime: manifest ${manifest.target} ${JSON.stringify(manifest.versions)}`);
}

const workspace = join(data, "workspace");
mkdirSync(data, { recursive: true });
mkdirSync(workspace, { recursive: true });
mkdirSync(join(data, "logs"), { recursive: true });

const log = createLogger({
  directory: join(data, "logs"),
  fileName: "verify.log",
  mirrorToConsole: true,
});

const host = new HostSupervisor({
  python,
  hostEntry,
  dataRoot: workspace,
  env: {
    ...process.env,
    PYTHONPATH: sitePackages,
    PYTHONNOUSERSITE: "1",
    OPENDIRECTOR_ROOT: workspace,
  },
  log,
  platform,
});

let exitCode = 0;
try {
  const started = Date.now();
  const ready = await host.start();
  console.log(`verify-runtime: Host ready on 127.0.0.1:${ready.port} in ${Date.now() - started} ms`);

  const health = await host.request("/api/health");
  if (health.status !== 200) throw new Error(`health returned ${health.status}`);

  const anonymous = await fetch(`http://127.0.0.1:${ready.port}/api/health`);
  if (anonymous.status !== 401) {
    throw new Error(`unauthenticated health returned ${anonymous.status}, expected 401`);
  }

  const status = await host.status();
  console.log(`verify-runtime: status ${JSON.stringify(status)}`);
  if (status.unknown && status.reason) {
    console.log(`verify-runtime: WARN status unavailable: ${status.reason}`);
  }

  const stopped = await host.stop();
  if (!stopped.graceful) throw new Error(`shutdown was not graceful: ${JSON.stringify(stopped)}`);
  console.log("verify-runtime: PASS dynamic port, token, health, status, graceful shutdown");
} catch (error) {
  exitCode = 1;
  console.error(`verify-runtime: FAIL ${error?.message ?? error}`);
  console.error(host.stderrTail.slice(-3000));
  await host.stop({ force: true }).catch(() => {});
} finally {
  host.killNow();
  console.log(`verify-runtime: log ${log.path}`);
}
process.exit(exitCode);
