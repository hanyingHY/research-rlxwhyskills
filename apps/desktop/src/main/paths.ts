/** Application resources and user data live in different places.
 *
 * Resources ship with the app and are replaced by an update: the Python runtime,
 * wheels, media tools. User data never moves: projects, model credentials, caches,
 * logs, preferences. Keeping them apart is what lets an update reinstall the app
 * directory without touching a project, and lets uninstall leave work behind. */

import path from "node:path";

export interface LayoutInput {
  /** `app.isPackaged`, or false when running from a checkout. */
  isPackaged: boolean;
  /** `process.resourcesPath` inside a packaged app. */
  resourcesPath: string;
  /** `app.getPath("userData")`. */
  userDataPath: string;
  /** Directory of the compiled main script; used to find dev resources. */
  moduleDirectory: string;
  /** Environment, so `OPENDIRECTOR_ROOT` keeps working as in the CLI. */
  env?: NodeJS.ProcessEnv;
}

export interface Layout {
  resources: {
    root: string;
    /** Bundled interpreter (`python.exe` on Windows). */
    pythonRuntime: string;
    /** Bundled wheels used when provisioning an environment without network. */
    wheels: string;
    /** Bundled media tools (`ffmpeg`, `ffprobe`). */
    bin: string;
    /** Built web application, when packaged next to the app instead of inside Python packages. */
    web: string;
  };
  user: {
    root: string;
    /** Projects, credentials and caches. */
    data: string;
    logs: string;
    config: string;
    /** Python virtual environment created by the desktop app when none is bundled. */
    venv: string;
  };
}

export function resolveLayout(input: LayoutInput): Layout {
  const env = input.env ?? process.env;
  const resourcesRoot = input.isPackaged
    ? input.resourcesPath
    : path.resolve(input.moduleDirectory, "..", "..", "..", "resources");
  // A version in this path would silently move every project on update.
  const userRoot = input.userDataPath;
  const explicitDataRoot = env.OPENDIRECTOR_ROOT?.trim();
  const data = explicitDataRoot
    ? path.resolve(explicitDataRoot)
    : path.join(userRoot, "data");
  return {
    resources: {
      root: resourcesRoot,
      pythonRuntime: path.join(resourcesRoot, "python-runtime"),
      wheels: path.join(resourcesRoot, "wheels"),
      bin: path.join(resourcesRoot, "bin"),
      web: path.join(resourcesRoot, "web"),
    },
    user: {
      root: userRoot,
      data,
      logs: path.join(userRoot, "logs"),
      config: path.join(userRoot, "config.json"),
      venv: path.join(userRoot, "runtime", "venv"),
    },
  };
}

/** Interpreter file name per platform; Windows ships `python.exe` next to the runtime. */
export function pythonExecutableName(platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? "python.exe" : "python3";
}

export function pythonExecutable(root: string, platform: NodeJS.Platform = process.platform): string {
  return path.join(root, pythonExecutableName(platform));
}

/** Virtual environment interpreter, which differs between Windows and POSIX. */
export function venvExecutable(venvRoot: string, platform: NodeJS.Platform = process.platform): string {
  return platform === "win32"
    ? path.join(venvRoot, "Scripts", "python.exe")
    : path.join(venvRoot, "bin", "python");
}
