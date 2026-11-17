/** Small HTTPS downloader shared by the release preparation scripts. */
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const USER_AGENT = "opendirector-desktop-build/1.0";

export async function getJson(url, headers = {}) {
  const response = await fetch(url, {
    headers: { accept: "application/vnd.github+json", "user-agent": USER_AGENT, ...headers },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`GET ${url} -> ${response.status} ${response.statusText}`);
  return response.json();
}

export async function download(url, destination, { expectedSha256 = null } = {}) {
  mkdirSync(dirname(destination), { recursive: true });
  if (existsSync(destination) && statSync(destination).size > 0 && !expectedSha256) {
    console.log(`download: reusing ${destination}`);
    return destination;
  }
  console.log(`download: ${url}`);
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT },
    redirect: "follow",
  });
  if (!response.ok || !response.body) {
    throw new Error(`GET ${url} -> ${response.status} ${response.statusText}`);
  }
  const hash = createHash("sha256");
  const source = Readable.fromWeb(response.body);
  source.on("data", (chunk) => hash.update(chunk));
  await pipeline(source, createWriteStream(destination));
  const digest = hash.digest("hex");
  if (expectedSha256 && digest !== expectedSha256.toLowerCase()) {
    throw new Error(
      `Checksum mismatch for ${destination}\n  expected ${expectedSha256}\n  actual   ${digest}`,
    );
  }
  console.log(`download: sha256 ${digest}`);
  return { path: destination, sha256: digest };
}

export function githubHeaders() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  return token ? { authorization: `Bearer ${token}` } : {};
}
