import type { PluginApi } from "@todoflowy/plugin-sdk";
import { describe, expect, it, vi } from "vitest";

import { createTodoGateway } from "../src/todos.js";
import { createTodo } from "./helpers.js";

describe("narrow Todo gateway", () => {
  it("reuses bounded week paging and delegates public writes", async () => {
    const todo = createTodo();
    const todos = {
      complete: vi.fn(async () => todo),
      create: vi.fn(async () => todo),
      get: vi.fn(async () => todo),
      list: vi.fn(async () => ({ items: [todo], nextCursor: null })),
      update: vi.fn(async () => todo),
    } as unknown as PluginApi["todos"];
    const gateway = createTodoGateway(todos);

    await expect(gateway.readWeek("UTC")).resolves.toHaveLength(1);
    await gateway.create({ title: "Created" });
    await gateway.update(todo.id, { revision: 7, title: "Updated" });
    await gateway.complete(todo.id, 8);

    expect(todos.list).toHaveBeenCalledWith({
      limit: 25,
      sort: "due_asc",
      timezone: "UTC",
      view: "week",
    });
    expect(todos.create).toHaveBeenCalledWith({ title: "Created" });
    expect(todos.update).toHaveBeenCalledWith(todo.id, {
      revision: 7,
      title: "Updated",
    });
    expect(todos.complete).toHaveBeenCalledWith(todo.id, 8);
    expect(todos.get).not.toHaveBeenCalled();
  });
});
