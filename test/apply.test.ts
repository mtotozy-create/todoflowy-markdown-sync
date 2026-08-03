import { describe, expect, it, vi } from "vitest";

import { executeApply } from "../src/apply.js";
import { computePreviewFingerprint } from "../src/core/fingerprint.js";
import {
  generateCanonicalMarkdown,
  parseMarkdown,
} from "../src/core/markdown.js";
import { buildApplyPlan } from "../src/core/plan.js";
import { createTodo, createWeeklyTodo, deferred } from "./helpers.js";

const SETTINGS = { timezone: "UTC", version: 1 as const };
const WEEK_ID = "UTC:2026-07-27/2026-08-03";

function apiError(code: string) {
  return Object.assign(new Error(code), { code });
}

async function preview(markdown: string, snapshot = [createWeeklyTodo()]) {
  const plan = buildApplyPlan(parseMarkdown(markdown), snapshot);
  const fingerprint = await computePreviewFingerprint({
    markdown,
    plan,
    settings: SETTINGS,
    snapshot,
    weekId: WEEK_ID,
  });
  return { fingerprint, plan, snapshot };
}

function gateway(
  snapshots: readonly (readonly ReturnType<typeof createWeeklyTodo>[])[],
) {
  const readWeek = vi.fn();
  for (const snapshot of snapshots) readWeek.mockResolvedValueOnce(snapshot);
  return {
    complete: vi.fn(async (id: string, revision: number) =>
      createTodo({ id, revision: revision + 1, status: "done" }),
    ),
    create: vi.fn(async ({ title }: { title: string }) =>
      createTodo({
        id: "00000000-0000-4000-8000-000000000009",
        revision: 1,
        title,
      }),
    ),
    readWeek,
    update: vi.fn(
      async (
        id: string,
        input: { revision: number; title?: string; status?: string },
      ) =>
        createTodo({
          id,
          revision: input.revision + 1,
          status: input.status === "todo" ? "todo" : "todo",
          title: input.title ?? "Write report",
        }),
    ),
  };
}

describe("sequential apply executor", () => {
  it("revalidates the complete preview before any write", async () => {
    const initial = [createWeeklyTodo()];
    const current = [createWeeklyTodo({ revision: 8 })];
    const prepared = await preview("- [x] Write report", initial);
    const api = gateway([current]);

    await expect(
      executeApply({
        ...prepared,
        gateway: api,
        markdown: "- [x] Write report",
        settings: SETTINGS,
        weekId: WEEK_ID,
      }),
    ).resolves.toMatchObject({ kind: "stale" });
    expect(api.create).not.toHaveBeenCalled();
    expect(api.update).not.toHaveBeenCalled();
    expect(api.complete).not.toHaveBeenCalled();
  });

  it("chains returned revisions and refreshes canonical state", async () => {
    const before = [createWeeklyTodo()];
    const after = [
      createWeeklyTodo({ revision: 9, status: "done", title: "Renamed" }),
    ];
    const markdown = `- [x] Renamed <!-- todoflowy:v1 id=${before[0]?.id} rev=7 status=todo -->`;
    const prepared = await preview(markdown, before);
    const api = gateway([before, after]);

    await expect(
      executeApply({
        ...prepared,
        gateway: api,
        markdown,
        settings: SETTINGS,
        weekId: WEEK_ID,
      }),
    ).resolves.toEqual({
      canonicalMarkdown: generateCanonicalMarkdown(after),
      kind: "applied",
      results: [
        {
          category: "completed",
          definiteSteps: ["updated"],
          line: 1,
          title: "Renamed",
        },
      ],
    });
    expect(api.update).toHaveBeenCalledWith(before[0]?.id, {
      revision: 7,
      title: "Renamed",
    });
    expect(api.complete).toHaveBeenCalledWith(before[0]?.id, 8);
  });

  it("continues after definite failures without retrying", async () => {
    const before: ReturnType<typeof createWeeklyTodo>[] = [];
    const markdown = "- [ ] First\n- [ ] Second";
    const prepared = await preview(markdown, before);
    const api = gateway([before, [createWeeklyTodo({ title: "Second" })]]);
    api.create
      .mockRejectedValueOnce(apiError("VALIDATION_FAILED"))
      .mockResolvedValueOnce(createTodo({ title: "Second" }));

    const result = await executeApply({
      ...prepared,
      gateway: api,
      markdown,
      settings: SETTINGS,
      weekId: WEEK_ID,
    });

    expect(result).toMatchObject({
      kind: "applied",
      results: [
        { category: "failed", line: 1, title: "First" },
        { category: "created", line: 2, title: "Second" },
      ],
    });
    expect(api.create).toHaveBeenCalledTimes(2);
  });

  it("stops after an uncertain compound failure and preserves definite steps", async () => {
    const before: ReturnType<typeof createWeeklyTodo>[] = [];
    const markdown = "- [x] First\n- [ ] Second";
    const prepared = await preview(markdown, before);
    const api = gateway([
      before,
      [createWeeklyTodo({ status: "todo", title: "First" })],
    ]);
    api.complete.mockRejectedValueOnce(apiError("TIMEOUT"));

    const result = await executeApply({
      ...prepared,
      gateway: api,
      markdown,
      settings: SETTINGS,
      weekId: WEEK_ID,
    });

    expect(result).toMatchObject({
      kind: "applied",
      results: [
        {
          category: "uncertain",
          definiteSteps: ["created"],
          line: 1,
          title: "First",
        },
      ],
    });
    expect(api.create).toHaveBeenCalledTimes(1);
  });

  it("suppresses late publication after generation disposal", async () => {
    const before: ReturnType<typeof createWeeklyTodo>[] = [];
    const prepared = await preview("- [ ] First", before);
    const pending = deferred<ReturnType<typeof createTodo>>();
    const api = gateway([before]);
    api.create.mockReturnValueOnce(pending.promise);
    let active = true;
    const operation = executeApply({
      ...prepared,
      gateway: api,
      isActive: () => active,
      markdown: "- [ ] First",
      settings: SETTINGS,
      weekId: WEEK_ID,
    });
    active = false;
    pending.resolve(createTodo());

    await expect(operation).resolves.toEqual({ kind: "disposed" });
    expect(api.readWeek).toHaveBeenCalledTimes(1);
  });

  it("preserves preview no-actions and classifies canonical refresh failure", async () => {
    const before: ReturnType<typeof createWeeklyTodo>[] = [];
    const prepared = await preview("plain", before);
    const api = gateway([before]);
    api.readWeek.mockRejectedValueOnce(apiError("OFFLINE_UNAVAILABLE"));

    await expect(
      executeApply({
        ...prepared,
        gateway: api,
        markdown: "plain",
        settings: SETTINGS,
        weekId: WEEK_ID,
      }),
    ).resolves.toEqual({
      canonicalMarkdown: null,
      kind: "applied",
      results: [
        { category: "failed", line: null, title: null },
        { category: "invalid", line: 1, title: null },
      ],
    });
  });
});
