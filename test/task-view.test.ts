/** @vitest-environment jsdom */

import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";

import { mountTaskView, type TaskViewDependencies } from "../src/task-view.js";
import type { DraftRecord } from "../src/storage.js";
import { createTodo, createWeeklyTodo, deferred } from "./helpers.js";

function fixture(
  options: {
    draft?: DraftRecord;
    snapshot?: ReturnType<typeof createWeeklyTodo>[];
  } = {},
) {
  const values = new Map<string, unknown>();
  if (options.draft !== undefined) values.set("draft", options.draft);
  let snapshot = [...(options.snapshot ?? [createWeeklyTodo()])];
  const listeners = new Map<string, Set<(payload: never) => void>>();
  const dependencies: TaskViewDependencies = {
    confirm: vi.fn(async () => true),
    getLocale: vi.fn(async () => "en-US"),
    getTheme: vi.fn(async () => "light" as const),
    now: () => new Date("2026-08-02T08:00:00.000Z"),
    on(type, listener) {
      const set = listeners.get(type) ?? new Set();
      set.add(listener as (payload: never) => void);
      listeners.set(type, set);
      return () => set.delete(listener as (payload: never) => void);
    },
    storage: {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => {
        values.set(key, value);
      }),
    },
    todos: {
      complete: vi.fn(async (id, revision) => {
        const existing = snapshot.find((todo) => todo.id === id);
        if (existing !== undefined)
          snapshot = snapshot.map((todo) =>
            todo.id === id
              ? { ...todo, revision: revision + 1, status: "done" }
              : todo,
          );
        return createTodo({ id, revision: revision + 1, status: "done" });
      }),
      create: vi.fn(async ({ title }) => {
        const todo = createWeeklyTodo({
          id: "00000000-0000-4000-8000-000000000009",
          revision: 1,
          title,
        });
        snapshot.push(todo);
        return createTodo(todo);
      }),
      readWeek: vi.fn(async () => snapshot),
      update: vi.fn(async (id, input) => {
        snapshot = snapshot.map((todo) =>
          todo.id === id
            ? {
                ...todo,
                revision: input.revision + 1,
                ...(input.status === undefined ? {} : { status: input.status }),
                ...(input.title === undefined ? {} : { title: input.title }),
              }
            : todo,
        );
        return createTodo({ id, revision: input.revision + 1, ...input });
      }),
    },
  };
  return {
    dependencies,
    emit(type: string, payload: unknown = {}) {
      for (const listener of listeners.get(type) ?? [])
        listener(payload as never);
    },
    setSnapshot(next: ReturnType<typeof createWeeklyTodo>[]) {
      snapshot = next;
    },
    values,
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

function editor(root: HTMLElement): EditorView {
  const value = root.querySelector<HTMLElement>(".cm-editor");
  const view = value === null ? null : EditorView.findFromDOM(value);
  if (view === null)
    throw new Error("Missing Markdown editor.");
  return view;
}

function button(root: HTMLElement, label: string): HTMLButtonElement {
  const value = [...root.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === label,
  );
  if (!(value instanceof HTMLButtonElement))
    throw new Error(`Missing ${label} button.`);
  return value;
}

function edit(view: EditorView, markdown: string) {
  view.dispatch({
    changes: { from: 0, insert: markdown, to: view.state.doc.length },
    userEvent: "input.type",
  });
}

describe("Markdown Sync task view", () => {
  it("loads canonical Markdown into a labeled clean editor", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const setup = fixture();
    const cleanup = await mountTaskView(root, setup.dependencies);

    const markdownEditor = editor(root);
    expect(markdownEditor.contentDOM.getAttribute("aria-label")).toBe(
      "Markdown",
    );
    expect(markdownEditor.state.sliceDoc()).toContain("<!-- todoflowy:v1");
    expect(markdownEditor.contentDOM.textContent).not.toContain("todoflowy:v1");
    const metadataToggle = button(root, "Show sync info");
    expect(metadataToggle.getAttribute("aria-pressed")).toBe("false");
    metadataToggle.click();
    expect(markdownEditor.contentDOM.textContent).toContain("todoflowy:v1");
    expect(metadataToggle.textContent).toBe("Hide sync info");
    expect(root.textContent).toContain("clean");
    expect(root.dataset.theme).toBe("light");
    expect(root.getAttribute("lang")).toBe("en-US");
    setup.emit("theme.changed", { theme: "dark" });
    setup.emit("locale.changed", { locale: "zh-CN" });
    expect(root.dataset.theme).toBe("dark");
    expect(root.getAttribute("lang")).toBe("zh-CN");
    expect(setup.values.get("draft")).toMatchObject({
      dirty: false,
      stale: false,
      version: 1,
    });
    cleanup();
    cleanup();
    expect(root.childNodes).toHaveLength(0);
    root.remove();
  });

  it("preserves dirty text, invalidates preview on edit, and supports select all", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const setup = fixture({
      draft: {
        dirty: true,
        markdown: "- [ ] Keep me",
        sourceFingerprint: "old",
        stale: false,
        updatedAt: "2026-08-01T00:00:00.000Z",
        version: 1,
      },
    });
    await mountTaskView(root, setup.dependencies);
    const markdownEditor = editor(root);
    expect(markdownEditor.state.sliceDoc()).toBe("- [ ] Keep me");
    expect(root.textContent).toContain("stale");

    button(root, "Preview").click();
    await vi.waitFor(() => expect(root.textContent).toContain("Preview ready"));
    edit(markdownEditor, "- [ ] Changed");
    await flush();
    expect(root.textContent).not.toContain("Preview ready");

    button(root, "Select all").click();
    expect(document.activeElement).toBe(markdownEditor.contentDOM);
    expect(markdownEditor.state.selection.main.from).toBe(0);
    expect(markdownEditor.state.selection.main.to).toBe(
      markdownEditor.state.doc.length,
    );
  });

  it("requires confirmation before discarding a dirty draft", async () => {
    const root = document.createElement("div");
    const setup = fixture({
      draft: {
        dirty: true,
        markdown: "- [ ] Keep",
        sourceFingerprint: null,
        stale: true,
        updatedAt: "2026-08-01T00:00:00.000Z",
        version: 1,
      },
    });
    vi.mocked(setup.dependencies.confirm)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    await mountTaskView(root, setup.dependencies);
    const markdownEditor = editor(root);

    button(root, "Refresh").click();
    await vi.waitFor(() =>
      expect(setup.dependencies.confirm).toHaveBeenCalledTimes(1),
    );
    await vi.waitFor(() =>
      expect(button(root, "Refresh").disabled).toBe(false),
    );
    expect(markdownEditor.state.sliceDoc()).toBe("- [ ] Keep");
    button(root, "Refresh").click();
    await vi.waitFor(() =>
      expect(markdownEditor.state.sliceDoc()).toContain("Write report"),
    );
  });

  it("previews, confirms, applies, and stores authoritative clean Markdown", async () => {
    const root = document.createElement("div");
    const setup = fixture({ snapshot: [] });
    await mountTaskView(root, setup.dependencies);
    const markdownEditor = editor(root);
    edit(markdownEditor, "- [ ] New");
    await flush();
    button(root, "Preview").click();
    await vi.waitFor(() => expect(root.textContent).toContain("Preview ready"));
    button(root, "Apply").click();
    await vi.waitFor(() =>
      expect(setup.dependencies.todos.create).toHaveBeenCalled(),
    );
    await vi.waitFor(() =>
      expect(markdownEditor.state.sliceDoc()).toContain(
        "id=00000000-0000-4000-8000-000000000009",
      ),
    );

    expect(setup.dependencies.confirm).toHaveBeenCalled();
    expect(setup.dependencies.todos.create).toHaveBeenCalledWith({
      title: "New",
    });
    expect(setup.values.get("draft")).toMatchObject({
      dirty: false,
      stale: false,
    });
    expect(root.textContent).toContain("created: 1");
  });

  it("round-trips complete Markdown edits from Obsidian by Todo identity", async () => {
    const root = document.createElement("div");
    const setup = fixture();
    await mountTaskView(root, setup.dependencies);
    const markdownEditor = editor(root);
    button(root, "Show sync info").click();

    edit(
      markdownEditor,
      markdownEditor.state
        .sliceDoc()
        .replace("Write report", "Edited in Obsidian"),
    );
    button(root, "Preview").click();
    await vi.waitFor(() => expect(root.textContent).toContain("Preview ready"));
    button(root, "Apply").click();

    await vi.waitFor(() =>
      expect(setup.dependencies.todos.update).toHaveBeenCalledWith(
        "00000000-0000-4000-8000-000000000001",
        { revision: 7, title: "Edited in Obsidian" },
      ),
    );
    expect(setup.dependencies.todos.create).not.toHaveBeenCalled();
  });

  it("refreshes clean drafts on Todo events and stales dirty drafts", async () => {
    const root = document.createElement("div");
    const setup = fixture();
    await mountTaskView(root, setup.dependencies);
    const markdownEditor = editor(root);
    setup.setSnapshot([createWeeklyTodo({ title: "External" })]);
    setup.emit("todos.changed");
    await vi.waitFor(() =>
      expect(markdownEditor.state.sliceDoc()).toContain("External"),
    );

    edit(markdownEditor, "- [ ] Local");
    await flush();
    setup.emit("todos.changed");
    await vi.waitFor(() => expect(root.textContent).toContain("stale"));
    expect(markdownEditor.state.sliceDoc()).toBe("- [ ] Local");
    expect(root.textContent).toContain("stale");
  });

  it("suppresses late event results after cleanup", async () => {
    const root = document.createElement("div");
    const setup = fixture();
    const cleanup = await mountTaskView(root, setup.dependencies);
    const pending = deferred<ReturnType<typeof createWeeklyTodo>[]>();
    vi.mocked(setup.dependencies.todos.readWeek).mockReturnValueOnce(
      pending.promise,
    );
    setup.emit("todos.changed");
    cleanup();
    pending.resolve([createWeeklyTodo({ title: "Late" })]);
    await flush();
    expect(root.childNodes).toHaveLength(0);
    expect(setup.dependencies.storage.set).not.toHaveBeenLastCalledWith(
      "draft",
      expect.objectContaining({ markdown: expect.stringContaining("Late") }),
    );
  });

  it("invalidates an approved preview when the apply snapshot changes", async () => {
    const root = document.createElement("div");
    const setup = fixture();
    await mountTaskView(root, setup.dependencies);
    const markdownEditor = editor(root);
    edit(markdownEditor, "- [x] Write report");
    button(root, "Preview").click();
    await vi.waitFor(() => expect(root.textContent).toContain("Preview ready"));
    setup.setSnapshot([createWeeklyTodo({ revision: 8 })]);

    button(root, "Apply").click();
    await vi.waitFor(() => expect(root.textContent).toContain("stale"));
    expect(setup.dependencies.todos.complete).not.toHaveBeenCalled();
    expect(markdownEditor.state.sliceDoc()).toBe("- [x] Write report");
  });

  it("blocks document-invalid apply and ignores malformed host events", async () => {
    const root = document.createElement("div");
    const setup = fixture({ snapshot: [] });
    await mountTaskView(root, setup.dependencies);
    edit(
      editor(root),
      Array.from({ length: 501 }, () => "- [ ] Task").join("\n"),
    );
    button(root, "Preview").click();
    await vi.waitFor(() => expect(root.textContent).toContain("Preview ready"));
    expect(button(root, "Apply").disabled).toBe(true);

    setup.emit("theme.changed", null);
    setup.emit("theme.changed", { theme: "unknown" });
    setup.emit("locale.changed", null);
    setup.emit("locale.changed", { locale: 42 });
    expect(root.dataset.theme).toBe("light");
    expect(root.getAttribute("lang")).toBe("en-US");
  });

  it("reports a draft that exceeds the plugin storage bound", async () => {
    const root = document.createElement("div");
    const setup = fixture({ snapshot: [] });
    await mountTaskView(root, setup.dependencies);
    edit(editor(root), "a".repeat(192 * 1024 + 1));
    await vi.waitFor(() =>
      expect(root.textContent).toContain("Draft is too large"),
    );
  });

  it("serializes and coalesces rapid native draft writes", async () => {
    const root = document.createElement("div");
    const setup = fixture({ snapshot: [] });
    await mountTaskView(root, setup.dependencies);
    const markdownEditor = editor(root);
    const firstWrite = deferred<void>();
    let activeWrites = 0;
    let maximumActiveWrites = 0;
    vi.mocked(setup.dependencies.storage.set).mockClear();
    vi.mocked(setup.dependencies.storage.set).mockImplementation(
      async (key, value) => {
        activeWrites += 1;
        maximumActiveWrites = Math.max(maximumActiveWrites, activeWrites);
        try {
          if (vi.mocked(setup.dependencies.storage.set).mock.calls.length === 1)
            await firstWrite.promise;
          setup.values.set(key, value);
        } finally {
          activeWrites -= 1;
        }
      },
    );

    edit(markdownEditor, "- [ ] A");
    edit(markdownEditor, "- [ ] Account");
    edit(markdownEditor, "- [ ] Account draft");
    await flush();
    expect(setup.dependencies.storage.set).toHaveBeenCalledTimes(1);

    firstWrite.resolve();
    await vi.waitFor(() =>
      expect(setup.values.get("draft")).toMatchObject({
        markdown: "- [ ] Account draft",
      }),
    );
    expect(setup.dependencies.storage.set).toHaveBeenCalledTimes(2);
    expect(maximumActiveWrites).toBe(1);
    expect(root.textContent).not.toContain("Draft is too large");
  });

  it("does not mislabel native storage failures as oversized drafts", async () => {
    const root = document.createElement("div");
    const setup = fixture({ snapshot: [] });
    await mountTaskView(root, setup.dependencies);
    vi.mocked(setup.dependencies.storage.set).mockRejectedValueOnce(
      new Error("native storage unavailable"),
    );

    edit(editor(root), "- [ ] Local");
    await vi.waitFor(() =>
      expect(root.textContent).toContain("Operation failed"),
    );
    expect(root.textContent).not.toContain("Draft is too large");
  });
});
