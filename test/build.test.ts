import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

describe("Markdown Sync production build", () => {
  it("declares the exact least-privilege Manifest", async () => {
    const manifest = JSON.parse(
      await readFile(resolve(root, "manifest.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(manifest).toMatchObject({
      engines: { pluginApi: "^1.0.0", todoflowy: ">=0.3.2 <0.4.0" },
      id: "todoflowy/markdown-sync",
      manifestVersion: 2,
      runtime: {
        capabilities: [
          "todos:read",
          "storage:read",
          "storage:write",
          "ui:toast",
        ],
        entry: "dist/runtime.js",
      },
      version: "1.1.0",
    });
    const extensions = manifest.extensions as Array<Record<string, unknown>>;
    expect(extensions).toEqual([
      {
        capabilities: [
          "todos:read",
          "todos:write",
          "storage:read",
          "storage:write",
          "ui:confirm",
          "theme:read",
          "context:locale",
        ],
        entry: "dist/task-view.js",
        id: "weekly-markdown",
        label: "Weekly Markdown",
        slot: "task-view",
      },
      {
        command: "markdown.sync-now",
        icon: "refresh-cw",
        id: "sync-now",
        label: "Refresh Markdown",
        slot: "toolbar-action",
      },
      {
        capabilities: [
          "storage:read",
          "storage:write",
          "theme:read",
          "context:locale",
        ],
        entry: "dist/settings.js",
        id: "markdown-settings",
        label: "Markdown timezone",
        slot: "settings-section",
      },
    ]);
    expect(
      extensions.find(({ slot }) => slot === "task-view"),
    ).not.toHaveProperty("icon");
  });

  it("emits exactly three self-contained ES2022 entries", async () => {
    expect((await readdir(resolve(root, "dist"))).sort()).toEqual([
      "runtime.js",
      "settings.js",
      "task-view.js",
    ]);
    for (const entry of ["runtime.js", "settings.js", "task-view.js"]) {
      const code = await readFile(resolve(root, "dist", entry), "utf8");
      expect(code).not.toMatch(/^\s*import\s/m);
      expect(code).not.toMatch(/\bimport\s*\(/);
      expect(code).not.toMatch(/(?:from\s*|require\s*\()\s*["']node:/);
      expect(code).not.toContain("sourceMappingURL");
      expect(code).not.toContain(repositoryRoot());
      expect(code).toMatch(/export\s*\{/);
    }
  });
});

function repositoryRoot() {
  return root;
}
