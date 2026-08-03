/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";

import {
  mountSettingsView,
  type SettingsDependencies,
} from "../src/settings.js";

function fixture() {
  const values = new Map<string, unknown>();
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const dependencies: SettingsDependencies = {
    getLocale: vi.fn(async () => "en-US"),
    getTheme: vi.fn(async () => "light" as const),
    now: () => new Date("2026-08-02T08:00:00.000Z"),
    on(type, listener) {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
      return () => set.delete(listener);
    },
    storage: {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => {
        values.set(key, value);
      }),
    },
  };
  return {
    dependencies,
    emit(type: string, payload: unknown) {
      for (const listener of listeners.get(type) ?? []) listener(payload);
    },
    values,
  };
}

function input(root: HTMLElement) {
  const value = root.querySelector("input");
  if (!(value instanceof HTMLInputElement))
    throw new Error("Missing timezone input.");
  return value;
}

function save(root: HTMLElement) {
  const value = root.querySelector("button");
  if (!(value instanceof HTMLButtonElement))
    throw new Error("Missing save button.");
  return value;
}

describe("Markdown Sync settings view", () => {
  it("loads and saves a validated IANA timezone", async () => {
    const root = document.createElement("div");
    const setup = fixture();
    const cleanup = await mountSettingsView(root, setup.dependencies);
    expect(input(root).labels?.[0]?.textContent).toBe("IANA timezone");
    input(root).value = "Asia/Shanghai";
    save(root).click();

    await vi.waitFor(() =>
      expect(setup.values.get("settings")).toEqual({
        timezone: "Asia/Shanghai",
        version: 1,
      }),
    );
    await vi.waitFor(() => expect(root.textContent).toContain("Saved"));
    cleanup();
    expect(root.childNodes).toHaveLength(0);
  });

  it("rejects an invalid timezone without writing", async () => {
    const root = document.createElement("div");
    const setup = fixture();
    await mountSettingsView(root, setup.dependencies);
    input(root).value = "invalid";
    save(root).click();

    await vi.waitFor(() =>
      expect(root.textContent).toContain("Invalid timezone"),
    );
    expect(setup.dependencies.storage.set).not.toHaveBeenCalled();
  });

  it("preserves draft bytes and marks the draft stale", async () => {
    const root = document.createElement("div");
    const setup = fixture();
    setup.values.set("draft", {
      dirty: true,
      markdown: "keep exactly",
      sourceFingerprint: "source",
      stale: false,
      updatedAt: "2026-08-01T00:00:00.000Z",
      version: 1,
    });
    await mountSettingsView(root, setup.dependencies);
    input(root).value = "Europe/Paris";
    save(root).click();

    await vi.waitFor(() =>
      expect(setup.values.get("draft")).toMatchObject({
        markdown: "keep exactly",
        sourceFingerprint: "source",
        stale: true,
      }),
    );
  });

  it("responds to theme/locale events and ignores late events after cleanup", async () => {
    const root = document.createElement("div");
    const setup = fixture();
    const cleanup = await mountSettingsView(root, setup.dependencies);
    setup.emit("theme.changed", { theme: "dark" });
    setup.emit("locale.changed", { locale: "zh-CN" });
    expect(root.dataset.theme).toBe("dark");
    expect(root.getAttribute("lang")).toBe("zh-CN");
    cleanup();
    setup.emit("theme.changed", { theme: "light" });
    expect(root.childNodes).toHaveLength(0);
  });

  it("shows a stable save failure and ignores malformed events", async () => {
    const root = document.createElement("div");
    const setup = fixture();
    vi.mocked(setup.dependencies.storage.set).mockRejectedValueOnce(
      new Error("private"),
    );
    await mountSettingsView(root, setup.dependencies);
    setup.emit("theme.changed", null);
    setup.emit("theme.changed", { theme: "unknown" });
    setup.emit("locale.changed", null);
    setup.emit("locale.changed", { locale: 42 });
    input(root).value = "UTC";
    save(root).click();

    await vi.waitFor(() => expect(root.textContent).toContain("Save failed"));
    expect(root.dataset.theme).toBe("light");
    expect(root.getAttribute("lang")).toBe("en-US");
  });
});
