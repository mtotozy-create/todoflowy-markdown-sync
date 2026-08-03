import { describe, expect, it } from "vitest";

import { parseMarkdown } from "../src/core/markdown.js";
import { buildApplyPlan } from "../src/core/plan.js";
import { createWeeklyTodo } from "./helpers.js";

const META =
  "<!-- todoflowy:v1 id=00000000-0000-4000-8000-000000000001 rev=7 status=todo -->";

describe("matching and apply planning", () => {
  it("plans metadata-backed rename without title fallback", () => {
    const plan = buildApplyPlan(parseMarkdown(`- [ ] Renamed ${META}`), [
      createWeeklyTodo(),
    ]);

    expect(plan.lines).toEqual([
      {
        finalCategory: "updated",
        kind: "action",
        line: 1,
        steps: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            input: { revision: 7, title: "Renamed" },
            type: "update",
          },
        ],
        title: "Renamed",
      },
    ]);
  });

  it.each([
    [
      `- [ ] Task <!-- todoflowy:v1 id=00000000-0000-4000-8000-000000000001 rev=6 status=todo -->`,
      "conflict",
    ],
    [
      `- [ ] Task <!-- todoflowy:v1 id=00000000-0000-4000-8000-000000000001 rev=7 status=in_progress -->`,
      "conflict",
    ],
    [
      `- [ ] Task <!-- todoflowy:v1 id=00000000-0000-4000-8000-000000000009 rev=7 status=todo -->`,
      "invalid",
    ],
  ])("classifies stale or out-of-week metadata", (markdown, category) => {
    expect(
      buildApplyPlan(parseMarkdown(markdown), [createWeeklyTodo()]).lines,
    ).toEqual([{ category, kind: "result", line: 1, title: "Task" }]);
  });

  it("marks every duplicate metadata claim ambiguous", () => {
    const plan = buildApplyPlan(
      parseMarkdown(`- [ ] One ${META}\n- [ ] Two ${META}`),
      [createWeeklyTodo()],
    );

    expect(plan.lines).toEqual([
      { category: "ambiguous", kind: "result", line: 1, title: "One" },
      { category: "ambiguous", kind: "result", line: 2, title: "Two" },
    ]);
  });

  it("uses exact-title fallback only for one input and one current Todo", () => {
    expect(
      buildApplyPlan(parseMarkdown("- [ ] Write report"), [createWeeklyTodo()])
        .lines,
    ).toEqual([
      { category: "unchanged", kind: "result", line: 1, title: "Write report" },
    ]);
    expect(
      buildApplyPlan(parseMarkdown("- [ ] Same"), [
        createWeeklyTodo({ title: "Same" }),
        createWeeklyTodo({
          id: "00000000-0000-4000-8000-000000000002",
          title: "Same",
        }),
      ]).lines,
    ).toEqual([
      { category: "ambiguous", kind: "result", line: 1, title: "Same" },
    ]);
    expect(
      buildApplyPlan(parseMarkdown("- [ ] New\n- [x] New"), [
        createWeeklyTodo(),
      ]).lines,
    ).toEqual([
      { category: "ambiguous", kind: "result", line: 1, title: "New" },
      { category: "ambiguous", kind: "result", line: 2, title: "New" },
    ]);
  });

  it("plans create, checked create, complete, reopen, and compound rename", () => {
    const active = createWeeklyTodo({ title: "Active" });
    const done = createWeeklyTodo({
      id: "00000000-0000-4000-8000-000000000002",
      status: "done",
      title: "Done",
    });
    const inProgress = createWeeklyTodo({
      id: "00000000-0000-4000-8000-000000000003",
      status: "in_progress",
      title: "Ongoing",
    });
    const plan = buildApplyPlan(
      parseMarkdown(
        [
          "- [ ] New",
          "- [x] New done",
          `- [x] Active <!-- todoflowy:v1 id=${active.id} rev=7 status=todo -->`,
          `- [ ] Done <!-- todoflowy:v1 id=${done.id} rev=7 status=done -->`,
          `- [x] Renamed <!-- todoflowy:v1 id=${inProgress.id} rev=7 status=in_progress -->`,
        ].join("\n"),
      ),
      [active, done, inProgress],
    );

    expect(plan.lines).toMatchObject([
      {
        finalCategory: "created",
        steps: [{ input: { title: "New" }, type: "create" }],
      },
      {
        finalCategory: "completed",
        steps: [
          { input: { title: "New done" }, type: "create" },
          { reference: "previous", type: "complete" },
        ],
      },
      {
        finalCategory: "completed",
        steps: [
          {
            id: active.id,
            reference: "snapshot",
            revision: 7,
            type: "complete",
          },
        ],
      },
      {
        finalCategory: "reopened",
        steps: [
          {
            id: done.id,
            input: { revision: 7, status: "todo" },
            type: "update",
          },
        ],
      },
      {
        finalCategory: "completed",
        steps: [
          {
            id: inProgress.id,
            input: { revision: 7, title: "Renamed" },
            type: "update",
          },
          { reference: "previous", type: "complete" },
        ],
      },
    ]);
  });

  it("never creates an action for a Todo missing from Markdown", () => {
    expect(
      buildApplyPlan(parseMarkdown(""), [createWeeklyTodo()]).lines,
    ).toEqual([]);
  });

  it("keeps parser invalid lines as no-action preview results", () => {
    expect(buildApplyPlan(parseMarkdown("plain"), []).lines).toEqual([
      { category: "invalid", kind: "result", line: 1, title: null },
    ]);
  });
});
