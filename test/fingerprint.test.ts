import { describe, expect, it } from "vitest";

import { computePreviewFingerprint } from "../src/core/fingerprint.js";
import { parseMarkdown } from "../src/core/markdown.js";
import { buildApplyPlan } from "../src/core/plan.js";
import { createWeeklyTodo } from "./helpers.js";

function input(overrides: Record<string, unknown> = {}) {
  const snapshot = [createWeeklyTodo()];
  const markdown = "- [ ] Write report";
  return {
    markdown,
    plan: buildApplyPlan(parseMarkdown(markdown), snapshot),
    settings: { timezone: "UTC", version: 1 as const },
    snapshot,
    weekId: "UTC:2026-07-27/2026-08-03",
    ...overrides,
  };
}

describe("preview fingerprint", () => {
  it("is stable and uses lowercase SHA-256", async () => {
    const first = await computePreviewFingerprint(input());
    const second = await computePreviewFingerprint(input());
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    ["markdown", { markdown: "- [x] Write report" }],
    ["settings", { settings: { timezone: "Asia/Shanghai", version: 1 } }],
    ["week", { weekId: "UTC:2026-08-03/2026-08-10" }],
    ["revision", { snapshot: [createWeeklyTodo({ revision: 8 })] }],
  ])("changes when %s changes", async (_label, overrides) => {
    expect(await computePreviewFingerprint(input(overrides))).not.toBe(
      await computePreviewFingerprint(input()),
    );
  });
});
