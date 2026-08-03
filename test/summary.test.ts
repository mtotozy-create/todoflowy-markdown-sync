import { describe, expect, it } from "vitest";

import { summarizeResults } from "../src/core/summary.js";

describe("stable result summaries", () => {
  it("orders document results before source lines and counts categories", () => {
    expect(
      summarizeResults([
        { category: "created", line: 3, title: "Three" },
        { category: "invalid", line: null, title: null },
        { category: "conflict", line: 2, title: "Two" },
        {
          category: "updated",
          definiteSteps: ["created"],
          line: 2,
          title: "Also two",
        },
      ]),
    ).toEqual({
      counts: { conflict: 1, created: 1, invalid: 1, updated: 1 },
      results: [
        { category: "invalid", line: null, title: null },
        { category: "conflict", line: 2, title: "Two" },
        {
          category: "updated",
          definiteSteps: ["created"],
          line: 2,
          title: "Also two",
        },
        { category: "created", line: 3, title: "Three" },
      ],
    });
  });
});
