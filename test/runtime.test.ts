/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";

import { computeSourceFingerprint } from "../src/core/fingerprint.js";
import { getWeekIdentity } from "../src/core/week.js";
import {
  startMarkdownRuntime,
  type RuntimeDependencies,
} from "../src/runtime.js";
import { createWeeklyTodo, deferred } from "./helpers.js";

function fixture() {
  const values = new Map<string, unknown>();
  let command: ((payload: unknown) => void) | undefined;
  const dependencies: RuntimeDependencies = {
    now: () => new Date("2026-08-02T08:00:00.000Z"),
    onCommand(listener) {
      command = listener;
      return () => {
        command = undefined;
      };
    },
    readWeek: vi.fn(async () => [createWeeklyTodo()]),
    storage: {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => {
        values.set(key, value);
      }),
    },
    toast: vi.fn(async () => {}),
  };
  return {
    dependencies,
    emit(value: unknown) {
      command?.(value);
    },
    values,
  };
}

describe("Markdown Sync runtime", () => {
  it("refreshes a clean draft and ignores unknown commands", async () => {
    const setup = fixture();
    const cleanup = await startMarkdownRuntime(setup.dependencies);
    setup.emit({ command: "other" });
    setup.emit({ command: "markdown.sync-now" });

    await vi.waitFor(() =>
      expect(setup.dependencies.toast).toHaveBeenCalledWith(
        "Markdown draft refreshed.",
      ),
    );
    expect(setup.values.get("draft")).toMatchObject({
      dirty: false,
      stale: false,
      version: 1,
    });
    expect(setup.dependencies.readWeek).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("reports a clean draft that is already current", async () => {
    const setup = fixture();
    const snapshot = [createWeeklyTodo()];
    const settings = { timezone: "UTC", version: 1 as const };
    const week = getWeekIdentity(setup.dependencies.now(), "UTC");
    setup.values.set("settings", settings);
    setup.values.set("draft", {
      dirty: false,
      markdown:
        "- [ ] Write report <!-- todoflowy:v1 id=00000000-0000-4000-8000-000000000001 rev=7 status=todo -->\n",
      sourceFingerprint: await computeSourceFingerprint(
        snapshot,
        settings,
        week.id,
      ),
      stale: false,
      updatedAt: "2026-08-02T08:00:00.000Z",
      version: 1,
    });
    const cleanup = await startMarkdownRuntime(setup.dependencies);
    setup.emit({ command: "markdown.sync-now" });

    await vi.waitFor(() =>
      expect(setup.dependencies.toast).toHaveBeenCalledWith(
        "Markdown draft is already current.",
      ),
    );
    cleanup();
  });

  it("preserves dirty text and marks it stale for task-view review", async () => {
    const setup = fixture();
    setup.values.set("draft", {
      dirty: true,
      markdown: "keep bytes",
      sourceFingerprint: "old",
      stale: false,
      updatedAt: "2026-08-01T00:00:00.000Z",
      version: 1,
    });
    await startMarkdownRuntime(setup.dependencies);
    setup.emit({ command: "markdown.sync-now" });

    await vi.waitFor(() =>
      expect(setup.dependencies.toast).toHaveBeenCalledWith(
        "Review the dirty Markdown draft in the task view.",
      ),
    );
    expect(setup.values.get("draft")).toMatchObject({
      markdown: "keep bytes",
      stale: true,
    });
  });

  it("uses a stable failure toast and suppresses late work after cleanup", async () => {
    const failed = fixture();
    vi.mocked(failed.dependencies.readWeek).mockRejectedValueOnce(
      new Error("private path"),
    );
    await startMarkdownRuntime(failed.dependencies);
    failed.emit({ command: "markdown.sync-now" });
    await vi.waitFor(() =>
      expect(failed.dependencies.toast).toHaveBeenCalledWith(
        "Markdown refresh failed.",
      ),
    );

    const late = fixture();
    const pending = deferred<ReturnType<typeof createWeeklyTodo>[]>();
    vi.mocked(late.dependencies.readWeek).mockReturnValueOnce(pending.promise);
    const cleanup = await startMarkdownRuntime(late.dependencies);
    late.emit({ command: "markdown.sync-now" });
    cleanup();
    pending.resolve([createWeeklyTodo({ title: "Late" })]);
    await Promise.resolve();
    await Promise.resolve();
    expect(late.dependencies.toast).not.toHaveBeenCalled();
    expect(late.dependencies.storage.set).not.toHaveBeenCalled();
  });

  it("serializes duplicate toolbar commands", async () => {
    const setup = fixture();
    const pending = deferred<ReturnType<typeof createWeeklyTodo>[]>();
    vi.mocked(setup.dependencies.readWeek).mockReturnValueOnce(pending.promise);
    await startMarkdownRuntime(setup.dependencies);
    setup.emit({ command: "markdown.sync-now" });
    setup.emit({ command: "markdown.sync-now" });
    await vi.waitFor(() =>
      expect(setup.dependencies.readWeek).toHaveBeenCalledTimes(1),
    );
    pending.resolve([createWeeklyTodo()]);
    await vi.waitFor(() =>
      expect(setup.dependencies.toast).toHaveBeenCalledTimes(1),
    );
  });
});
