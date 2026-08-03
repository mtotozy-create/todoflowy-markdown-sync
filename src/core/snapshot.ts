import type {
  PluginTodoList,
  PluginTodoListQuery,
} from "@todoflowy/plugin-contracts";

import { MAX_CHECKBOX_LINES } from "./markdown.js";
import type { WeeklyTodoSnapshot } from "./types.js";

export type ListTodos = (query: PluginTodoListQuery) => Promise<PluginTodoList>;
export type SnapshotReadErrorCode = "repeated_cursor" | "too_many_todos";

export class SnapshotReadError extends Error {
  readonly code: SnapshotReadErrorCode;

  constructor(code: SnapshotReadErrorCode) {
    super(code);
    this.name = "SnapshotReadError";
    this.code = code;
  }
}

export async function readWeeklySnapshot(
  list: ListTodos,
  timezone: string,
): Promise<readonly WeeklyTodoSnapshot[]> {
  const snapshot: WeeklyTodoSnapshot[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  while (true) {
    const page = await list({
      ...(cursor === undefined ? {} : { cursor }),
      limit: 25,
      sort: "due_asc",
      timezone,
      view: "week",
    });
    for (const todo of page.items) {
      if (todo.status === "cancelled") continue;
      snapshot.push({
        createdAt: todo.createdAt,
        dueTime: todo.dueTime,
        id: todo.id,
        revision: todo.revision,
        startTime: todo.startTime,
        status: todo.status,
        title: todo.title,
      });
      if (snapshot.length > MAX_CHECKBOX_LINES)
        throw new SnapshotReadError("too_many_todos");
    }
    if (page.nextCursor === null) return snapshot;
    if (seenCursors.has(page.nextCursor))
      throw new SnapshotReadError("repeated_cursor");
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
}
