/** The one invariant that protects user work: data never lives in the install directory. */

import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

import { resolveLayout, venvExecutable } from "../src/main/paths";

const packaged = resolveLayout({
  isPackaged: true,
  resourcesPath: "C:/Program Files/OpenDirector/resources",
  userDataPath: "C:/Users/me/AppData/Roaming/OpenDirector",
  moduleDirectory: "C:/Program Files/OpenDirector/resources/app.asar/dist/src/main",
  env: {},
});

test("user data is outside the application resources", () => {
  assert.equal(
    packaged.user.data.startsWith(packaged.resources.root),
    false,
    "projects must survive replacing the install directory",
  );
});

test("the data path carries no version, so an update cannot move a project", () => {
  assert.equal(/[\\/]app-[\d.]|[\\/]\d+\.\d+\.\d+[\\/]/.test(packaged.user.data), false);
});

test("projects, logs and preferences are separated", () => {
  assert.notEqual(packaged.user.data, packaged.user.logs);
  assert.notEqual(packaged.user.data, packaged.user.config);
  assert.equal(packaged.user.data, path.join(packaged.user.root, "data"));
  assert.equal(packaged.user.logs, path.join(packaged.user.root, "logs"));
});

test("OPENDIRECTOR_ROOT still decides where projects live, as in the CLI", () => {
  const layout = resolveLayout({
    isPackaged: true,
    resourcesPath: "/resources",
    userDataPath: "/user",
    moduleDirectory: "/app",
    env: { OPENDIRECTOR_ROOT: "/work/opendirector" },
  });
  assert.equal(layout.user.data, path.resolve("/work/opendirector"));
});

test("bundled resources keep the expected layout", () => {
  assert.equal(packaged.resources.pythonRuntime, path.join(packaged.resources.root, "python-runtime"));
  assert.equal(packaged.resources.bin, path.join(packaged.resources.root, "bin"));
  assert.equal(packaged.resources.wheels, path.join(packaged.resources.root, "wheels"));
});

test("the virtual environment interpreter follows the platform", () => {
  assert.equal(
    venvExecutable("/user/runtime/venv", "win32"),
    path.join("/user/runtime/venv", "Scripts", "python.exe"),
  );
  assert.equal(venvExecutable("/user/runtime/venv", "linux"), "/user/runtime/venv/bin/python");
});

test("a source checkout resolves resources next to the compiled main script", () => {
  const layout = resolveLayout({
    isPackaged: false,
    resourcesPath: "",
    userDataPath: "/user",
    moduleDirectory: "/repo/apps/desktop/dist/src/main",
    env: {},
  });
  assert.equal(layout.resources.root, "/repo/apps/desktop/resources");
});
