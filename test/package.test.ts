import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const pluginRoot = resolve(import.meta.dirname, "..");
const cli = resolve(
  pluginRoot,
  "node_modules/@todoflowy/plugin-toolkit/dist/cli.js",
);
const compatibility = [
  "--todoflowy-version",
  "0.3.2",
  "--plugin-api-range",
  "^1.0.0",
];
let temporary = "";
let first = "";
let second = "";

beforeAll(async () => {
  temporary = await mkdtemp(join(tmpdir(), "todoflowy-markdown-sync-"));
  first = join(temporary, "first.zip");
  second = join(temporary, "second.zip");
  const firstPack = run(["pack", pluginRoot, "--out", first, ...compatibility]);
  const secondPack = run([
    "pack",
    pluginRoot,
    "--out",
    second,
    ...compatibility,
  ]);
  expect(firstPack.status, firstPack.stderr).toBe(0);
  expect(firstPack.stderr).toBe("");
  expect(secondPack.status, secondPack.stderr).toBe(0);
  expect(secondPack.stderr).toBe("");
});

afterAll(async () => {
  if (temporary !== "") await rm(temporary, { force: true, recursive: true });
});

function run(args: readonly string[]) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
}

describe("Markdown Sync deterministic package", () => {
  it("packs, validates, inspects, and hashes the actual build", async () => {
    const validated = run(["validate", first, ...compatibility]);
    expect(validated.status).toBe(0);
    expect(validated.stdout).toMatch(
      /^valid todoflowy\/markdown-sync@1\.0\.1 size=\d+ sha256=[a-f0-9]{64}\n$/,
    );

    const inspected = run(["inspect", first, ...compatibility]);
    expect(inspected.status).toBe(0);
    const value = JSON.parse(inspected.stdout) as {
      entries: Array<{ path: string }>;
      sha256: string;
    };
    expect(value.entries.map(({ path }) => path)).toEqual([
      "dist/runtime.js",
      "dist/settings.js",
      "dist/task-view.js",
      "manifest.json",
    ]);

    const hashed = run(["hash", first]);
    expect(hashed.status).toBe(0);
    expect(hashed.stdout.trim()).toBe(value.sha256);
    expect(value.sha256).toBe(
      createHash("sha256")
        .update(await readFile(first))
        .digest("hex"),
    );
  });

  it("produces byte-identical packages", async () => {
    expect(await readFile(second)).toEqual(await readFile(first));
  });
});
