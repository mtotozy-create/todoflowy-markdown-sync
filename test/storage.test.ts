import { describe, expect, it, vi } from "vitest";

import {
  StorageRecordError,
  type StorageRecordErrorCode,
  loadDraft,
  loadSettings,
  saveDraft,
  saveSettings,
} from "../src/storage.js";

function storage(values: Record<string, unknown> = {}) {
  return {
    get: vi.fn(async (key: string) => values[key] ?? null),
    set: vi.fn(async () => {}),
  };
}

describe("versioned account storage", () => {
  it("loads safe defaults and writes only stable records", async () => {
    const gateway = storage();
    expect(await loadSettings(gateway, "UTC")).toEqual({
      timezone: "UTC",
      version: 1,
    });
    expect(await loadDraft(gateway)).toBeNull();

    await saveSettings(gateway, { timezone: "Asia/Shanghai", version: 1 });
    await saveDraft(gateway, {
      dirty: true,
      markdown: "- [ ] Draft",
      sourceFingerprint: null,
      stale: false,
      updatedAt: "2026-08-02T08:00:00.000Z",
      version: 1,
    });

    expect(gateway.set.mock.calls).toEqual([
      ["settings", { timezone: "Asia/Shanghai", version: 1 }],
      [
        "draft",
        {
          dirty: true,
          markdown: "- [ ] Draft",
          sourceFingerprint: null,
          stale: false,
          updatedAt: "2026-08-02T08:00:00.000Z",
          version: 1,
        },
      ],
    ]);
  });

  it("falls back from invalid legacy settings without touching a dirty draft", async () => {
    const gateway = storage({
      draft: {
        dirty: true,
        markdown: "keep exactly",
        sourceFingerprint: "abc",
        stale: true,
        updatedAt: "2026-08-02T08:00:00.000Z",
        version: 1,
      },
      settings: { timezone: "invalid legacy" },
    });

    expect(await loadSettings(gateway, "UTC")).toEqual({
      timezone: "UTC",
      version: 1,
    });
    expect(await loadDraft(gateway)).toMatchObject({
      dirty: true,
      markdown: "keep exactly",
    });
    expect(gateway.set).not.toHaveBeenCalled();
  });

  it.each([
    [
      "settings",
      { timezone: "UTC", version: 2 },
      "unsupported_settings_version",
    ],
    [
      "draft",
      { dirty: true, markdown: "x", version: 2 },
      "unsupported_draft_version",
    ],
  ])("fails visibly for unknown %s versions", async (key, value, code) => {
    const gateway = storage({ [key]: value });
    const operation =
      key === "settings" ? loadSettings(gateway, "UTC") : loadDraft(gateway);
    await expect(operation).rejects.toEqual(
      new StorageRecordError(code as StorageRecordErrorCode),
    );
    expect(gateway.set).not.toHaveBeenCalled();
  });

  it("rejects oversized drafts before storage", async () => {
    const gateway = storage();
    await expect(
      saveDraft(gateway, {
        dirty: true,
        markdown: "a".repeat(192 * 1024 + 1),
        sourceFingerprint: null,
        stale: false,
        updatedAt: "2026-08-02T08:00:00.000Z",
        version: 1,
      }),
    ).rejects.toEqual(new StorageRecordError("draft_too_large"));
    expect(gateway.set).not.toHaveBeenCalled();
  });

  it("rejects invalid v1 records and stored oversized drafts", async () => {
    await expect(
      loadSettings(
        storage({ settings: { timezone: "invalid", version: 1 } }),
        "UTC",
      ),
    ).rejects.toEqual(new StorageRecordError("invalid_settings"));
    await expect(loadDraft(storage({ draft: "invalid" }))).rejects.toEqual(
      new StorageRecordError("invalid_draft"),
    );
    await expect(
      loadDraft(
        storage({
          draft: {
            dirty: true,
            markdown: "a".repeat(192 * 1024 + 1),
            sourceFingerprint: null,
            stale: false,
            updatedAt: "2026-08-02T08:00:00.000Z",
            version: 1,
          },
        }),
      ),
    ).rejects.toEqual(new StorageRecordError("draft_too_large"));
  });

  it("rejects invalid settings before storage", async () => {
    const gateway = storage();
    await expect(
      saveSettings(gateway, { timezone: "invalid", version: 1 }),
    ).rejects.toEqual(new StorageRecordError("invalid_settings"));
    expect(gateway.set).not.toHaveBeenCalled();
  });
});
