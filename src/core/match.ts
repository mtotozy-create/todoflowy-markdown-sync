import type { ParsedTaskLine, WeeklyTodoSnapshot } from "./types.js";

export interface MatchIndex {
  readonly metadataClaims: ReadonlyMap<string, number>;
  readonly titleClaims: ReadonlyMap<string, number>;
  readonly todosById: ReadonlyMap<string, WeeklyTodoSnapshot>;
  readonly todosByTitle: ReadonlyMap<string, readonly WeeklyTodoSnapshot[]>;
}

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

export function createMatchIndex(
  lines: readonly ParsedTaskLine[],
  snapshot: readonly WeeklyTodoSnapshot[],
): MatchIndex {
  const metadataClaims = new Map<string, number>();
  const titleClaims = new Map<string, number>();
  for (const line of lines) {
    if (line.metadata === null) increment(titleClaims, line.title);
    else increment(metadataClaims, line.metadata.id);
  }

  const todosById = new Map<string, WeeklyTodoSnapshot>();
  const todosByTitle = new Map<string, WeeklyTodoSnapshot[]>();
  for (const todo of snapshot) {
    todosById.set(todo.id, todo);
    const matches = todosByTitle.get(todo.title) ?? [];
    matches.push(todo);
    todosByTitle.set(todo.title, matches);
  }
  return { metadataClaims, titleClaims, todosById, todosByTitle };
}
