import type { PluginTodo } from "@todoflowy/plugin-contracts";

import type { WeeklyTodoSnapshot } from "../src/core/types.js";

export const FIXED_NOW = "2026-08-02T08:00:00.000Z";

export function createTodo(overrides: Partial<PluginTodo> = {}): PluginTodo {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    title: "Write report",
    description: "",
    status: "todo",
    priority: "medium",
    startTime: "2026-07-27T09:00:00.000Z",
    dueTime: "2026-08-02T10:00:00.000Z",
    completedAt: null,
    projectId: null,
    tagIds: [],
    revision: 7,
    createdAt: "2026-07-27T08:00:00.000Z",
    updatedAt: "2026-08-01T08:00:00.000Z",
    ...overrides,
  };
}

export function createWeeklyTodo(
  overrides: Partial<WeeklyTodoSnapshot> = {},
): WeeklyTodoSnapshot {
  return {
    createdAt: "2026-07-27T08:00:00.000Z",
    dueTime: "2026-08-02T10:00:00.000Z",
    id: "00000000-0000-4000-8000-000000000001",
    revision: 7,
    startTime: "2026-07-27T09:00:00.000Z",
    status: "todo",
    title: "Write report",
    ...overrides,
  };
}

export function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
