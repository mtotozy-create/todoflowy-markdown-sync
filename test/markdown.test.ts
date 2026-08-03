import { describe, expect, it } from "vitest";

import {
  MAX_CHECKBOX_LINES,
  MAX_MARKDOWN_BYTES,
  generateCanonicalMarkdown,
  parseMarkdown,
} from "../src/core/markdown.js";
import { createTodo } from "./helpers.js";

describe("Markdown contract", () => {
  it("round-trips canonical lines and defined title escapes", () => {
    const todos = [
      createTodo({
        id: "00000000-0000-4000-8000-000000000001",
        title: "Write \\ report\r\n<!-- todoflowy: literal",
        status: "todo",
      }),
      createTodo({
        id: "00000000-0000-4000-8000-000000000002",
        title: "正在处理",
        status: "in_progress",
        revision: 8,
      }),
      createTodo({
        id: "00000000-0000-4000-8000-000000000003",
        title: "Finished",
        status: "done",
        revision: 9,
      }),
    ];

    const markdown = generateCanonicalMarkdown(todos);

    expect(markdown).toContain(
      "- [ ] Write \\\\ report\\r\\n\\<!-- todoflowy: literal ",
    );
    expect(markdown).toContain("- [x] Finished ");
    expect(markdown.endsWith("\n")).toBe(true);
    const parsed = parseMarkdown(markdown);
    expect(parsed).toMatchObject({ kind: "valid" });
    if (parsed.kind === "valid")
      expect(
        parsed.lines.map((line) => line.kind === "task" && line.title),
      ).toEqual([todos[0]?.title, todos[1]?.title, todos[2]?.title]);
  });

  it("accepts the three markers, uppercase checks, and ignores blanks", () => {
    const parsed = parseMarkdown("\n* [ ] First\n+ [X] Second\n- [x] Third\n");

    expect(parsed).toEqual({
      kind: "valid",
      lines: [
        {
          checked: false,
          kind: "task",
          line: 2,
          metadata: null,
          title: "First",
        },
        {
          checked: true,
          kind: "task",
          line: 3,
          metadata: null,
          title: "Second",
        },
        {
          checked: true,
          kind: "task",
          line: 4,
          metadata: null,
          title: "Third",
        },
      ],
    });
  });

  it.each([
    ["plain text", "unrecognized"],
    ["- [ ]    ", "empty_title"],
    ["- [y] Not a checkbox", "unrecognized"],
    [
      "- [ ] Task <!-- todoflowy:v2 id=00000000-0000-4000-8000-000000000001 rev=1 status=todo -->",
      "invalid_metadata",
    ],
    [
      "- [ ] Task <!-- todoflowy:v1 id=bad rev=1 status=todo -->",
      "invalid_metadata",
    ],
    [
      "- [ ] Task <!-- todoflowy:v1 id=00000000-0000-4000-8000-000000000001 rev=-1 status=todo -->",
      "invalid_metadata",
    ],
    [
      "- [ ] Task <!-- todoflowy:v1 id=00000000-0000-4000-8000-000000000001 rev=1 status=cancelled -->",
      "invalid_metadata",
    ],
    [
      "- [ ] Task <!-- todoflowy:v1 id=00000000-0000-4000-8000-000000000001 rev=1 status=todo --> <!-- todoflowy:v1 id=00000000-0000-4000-8000-000000000002 rev=2 status=todo -->",
      "duplicate_metadata",
    ],
  ])("records invalid line %s", (markdown, code) => {
    expect(parseMarkdown(markdown)).toEqual({
      kind: "valid",
      lines: [{ code, kind: "invalid", line: 1 }],
    });
  });

  it("stops on document byte and checkbox count bounds", () => {
    expect(parseMarkdown("a".repeat(MAX_MARKDOWN_BYTES + 1))).toEqual({
      code: "document_too_large",
      kind: "invalid",
    });
    expect(
      parseMarkdown(
        Array.from({ length: MAX_CHECKBOX_LINES + 1 }, () => "- [ ] Task").join(
          "\n",
        ),
      ),
    ).toEqual({ code: "too_many_checkbox_lines", kind: "invalid" });
  });

  it("generates a flat stable order and excludes cancelled Todos", () => {
    const markdown = generateCanonicalMarkdown([
      createTodo({
        id: "00000000-0000-4000-8000-000000000004",
        dueTime: null,
        startTime: null,
        createdAt: "2026-07-29T00:00:00.000Z",
        title: "Null dates",
      }),
      createTodo({
        id: "00000000-0000-4000-8000-000000000003",
        dueTime: "2026-08-02T09:00:00.000Z",
        title: "Earlier",
      }),
      createTodo({
        id: "00000000-0000-4000-8000-000000000002",
        dueTime: "2026-08-02T10:00:00.000Z",
        title: "Later",
      }),
      createTodo({
        id: "00000000-0000-4000-8000-000000000005",
        status: "cancelled",
        title: "Cancelled",
      }),
    ]);

    expect(
      markdown
        .split("\n")
        .filter(Boolean)
        .map((line) => line.split(" <!--")[0]),
    ).toEqual(["- [ ] Earlier", "- [ ] Later", "- [ ] Null dates"]);
    expect(generateCanonicalMarkdown([])).toBe("");
  });
});
