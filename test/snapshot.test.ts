import { describe, expect, it, vi } from "vitest";

import { SnapshotReadError, readWeeklySnapshot } from "../src/core/snapshot.js";
import { createTodo } from "./helpers.js";

describe("weekly snapshot gateway", () => {
  it("paginates sequentially, filters cancelled, and projects public fields", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        items: [
          createTodo(),
          createTodo({
            id: "00000000-0000-4000-8000-000000000002",
            status: "cancelled",
          }),
        ],
        nextCursor: "next",
      })
      .mockResolvedValueOnce({
        items: [
          createTodo({
            id: "00000000-0000-4000-8000-000000000003",
            title: "Second",
          }),
        ],
        nextCursor: null,
      });

    await expect(readWeeklySnapshot(list, "Asia/Shanghai")).resolves.toEqual([
      {
        createdAt: "2026-07-27T08:00:00.000Z",
        dueTime: "2026-08-02T10:00:00.000Z",
        id: "00000000-0000-4000-8000-000000000001",
        revision: 7,
        startTime: "2026-07-27T09:00:00.000Z",
        status: "todo",
        title: "Write report",
      },
      {
        createdAt: "2026-07-27T08:00:00.000Z",
        dueTime: "2026-08-02T10:00:00.000Z",
        id: "00000000-0000-4000-8000-000000000003",
        revision: 7,
        startTime: "2026-07-27T09:00:00.000Z",
        status: "todo",
        title: "Second",
      },
    ]);
    expect(list.mock.calls).toEqual([
      [{ limit: 25, sort: "due_asc", timezone: "Asia/Shanghai", view: "week" }],
      [
        {
          cursor: "next",
          limit: 25,
          sort: "due_asc",
          timezone: "Asia/Shanghai",
          view: "week",
        },
      ],
    ]);
  });

  it("rejects repeated cursors", async () => {
    const list = vi.fn().mockResolvedValue({ items: [], nextCursor: "same" });

    await expect(readWeeklySnapshot(list, "UTC")).rejects.toEqual(
      new SnapshotReadError("repeated_cursor"),
    );
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("rejects more than 500 active Todos", async () => {
    const items = Array.from({ length: 501 }, (_, index) =>
      createTodo({
        id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      }),
    );
    const list = vi.fn().mockResolvedValue({ items, nextCursor: null });

    await expect(readWeeklySnapshot(list, "UTC")).rejects.toEqual(
      new SnapshotReadError("too_many_todos"),
    );
  });
});
