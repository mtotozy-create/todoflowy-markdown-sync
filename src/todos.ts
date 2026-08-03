import type {
  PluginCreateTodoInput,
  PluginTodo,
  PluginUpdateTodoInput,
} from "@todoflowy/plugin-contracts";
import type { PluginApi } from "@todoflowy/plugin-sdk";

import { readWeeklySnapshot } from "./core/snapshot.js";
import type { WeeklyTodoSnapshot } from "./core/types.js";

export interface TodoGateway {
  complete(id: string, revision: number): Promise<PluginTodo>;
  create(input: PluginCreateTodoInput): Promise<PluginTodo>;
  readWeek(timezone: string): Promise<readonly WeeklyTodoSnapshot[]>;
  update(id: string, input: PluginUpdateTodoInput): Promise<PluginTodo>;
}

export function createTodoGateway(todos: PluginApi["todos"]): TodoGateway {
  return {
    complete: (id, revision) => todos.complete(id, revision),
    create: (input) => todos.create(input),
    readWeek: (timezone) =>
      readWeeklySnapshot((query) => todos.list(query), timezone),
    update: (id, input) => todos.update(id, input),
  };
}
