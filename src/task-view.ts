import { defineView, plugin } from "@todoflowy/plugin-sdk";

import { executeApply } from "./apply.js";
import {
  computePreviewFingerprint,
  computeSourceFingerprint,
} from "./core/fingerprint.js";
import { generateCanonicalMarkdown, parseMarkdown } from "./core/markdown.js";
import { buildApplyPlan, type ApplyPlan } from "./core/plan.js";
import { summarizeResults, type StableLineResult } from "./core/summary.js";
import type { WeeklyTodoSnapshot } from "./core/types.js";
import { getWeekIdentity, resolveDefaultTimeZone } from "./core/week.js";
import { button, element } from "./dom.js";
import {
  createMarkdownEditor,
  type MarkdownEditorController,
} from "./markdown-editor.js";
import {
  loadDraft,
  loadSettings,
  saveDraft,
  StorageRecordError,
  type DraftRecord,
  type StorageGateway,
} from "./storage.js";
import { TASK_VIEW_CSS } from "./task-view.css.js";
import { createTodoGateway, type TodoGateway } from "./todos.js";

type TaskViewEventType = "locale.changed" | "theme.changed" | "todos.changed";

export interface TaskViewDependencies {
  readonly confirm: (message: string) => Promise<boolean>;
  readonly getLocale: () => Promise<string>;
  readonly getTheme: () => Promise<"dark" | "light">;
  readonly now: () => Date;
  readonly on: (
    type: TaskViewEventType,
    listener: (payload: unknown) => void,
  ) => () => void;
  readonly storage: StorageGateway;
  readonly todos: TodoGateway;
}

interface PreviewState {
  readonly documentValid: boolean;
  readonly fingerprint: string;
  readonly plan: ApplyPlan;
  readonly snapshot: readonly WeeklyTodoSnapshot[];
  readonly weekId: string;
}

/* v8 ignore start -- the real SDK wiring is exercised by the production Runtime Chromium suite */
function productionDependencies(): TaskViewDependencies {
  return {
    confirm: (message) =>
      plugin.ui.confirm({
        cancelLabel: "Cancel",
        confirmLabel: "Continue",
        message,
        title: "Markdown Sync",
      }),
    getLocale: () => plugin.context.getLocale(),
    getTheme: () => plugin.theme.get(),
    now: () => new Date(),
    on: (type, listener) => plugin.events.on(type, listener as never),
    storage: plugin.storage,
    todos: createTodoGateway(plugin.todos),
  };
}
/* v8 ignore stop */

export async function mountTaskView(
  root: HTMLElement,
  dependencies: TaskViewDependencies,
): Promise<() => void> {
  let active = true;
  let busy = false;
  let dirty = false;
  let stale = false;
  const settings = await loadSettings(
    dependencies.storage,
    resolveDefaultTimeZone(),
  );
  if (!active) return () => {};
  const [theme, locale, storedDraft, initialSnapshot] = await Promise.all([
    dependencies.getTheme(),
    dependencies.getLocale(),
    loadDraft(dependencies.storage),
    dependencies.todos.readWeek(settings.timezone),
  ]);
  if (!active) return () => {};

  const style = element("style");
  style.textContent = TASK_VIEW_CSS;
  const container = element("section", { className: "markdown-sync" });
  const heading = element("h2", { text: "Markdown Sync" });
  const meta = element("p", { className: "markdown-sync__meta" });
  const label = element("label", { text: "Markdown" });
  const editorHost = element("div", { className: "markdown-sync__editor" });
  const controls = element("div", { className: "markdown-sync__controls" });
  const refreshButton = button("Refresh");
  const selectButton = button("Select all");
  const metadataButton = button("Show sync info");
  const previewButton = button("Preview");
  const applyButton = button("Apply");
  controls.append(
    refreshButton,
    selectButton,
    metadataButton,
    previewButton,
    applyButton,
  );
  const status = element("p", { className: "markdown-sync__status" });
  status.setAttribute("aria-live", "polite");
  const details = element("pre", { className: "markdown-sync__details" });
  container.append(heading, meta, label, editorHost, controls, status, details);
  root.replaceChildren(style, container);
  root.dataset.theme = theme;
  root.setAttribute("lang", locale);

  let preview: PreviewState | null = null;
  let summary: readonly StableLineResult[] = [];
  let pendingDraft: DraftRecord | null = null;
  let draftPersistence: Promise<void> | null = null;
  let metadataVisible = false;
  let week = getWeekIdentity(dependencies.now(), settings.timezone);
  let currentSourceFingerprint = await computeSourceFingerprint(
    initialSnapshot,
    settings,
    week.id,
  );
  if (!active) return () => {};

  const canonical = generateCanonicalMarkdown(initialSnapshot);
  let initialMarkdown: string;
  let persistInitialDraft = false;
  if (storedDraft === null || !storedDraft.dirty) {
    initialMarkdown = canonical;
    dirty = false;
    stale = false;
    persistInitialDraft = true;
  } else {
    initialMarkdown = storedDraft.markdown;
    dirty = true;
    stale =
      storedDraft.stale ||
      storedDraft.sourceFingerprint !== currentSourceFingerprint;
    persistInitialDraft = stale !== storedDraft.stale;
  }

  let onEditorChange = () => {};
  const editor: MarkdownEditorController = createMarkdownEditor({
    initialValue: initialMarkdown,
    label: "Markdown",
    onChange: () => onEditorChange(),
    parent: editorHost,
  });

  const render = () => {
    if (!active) return;
    meta.textContent = `${week.id} · ${settings.timezone}`;
    const states = [dirty ? "dirty" : "clean"];
    if (stale) states.push("stale");
    if (preview !== null) states.push("Preview ready");
    if (busy) states.push("loading");
    status.textContent = states.join(" · ");
    applyButton.disabled = busy || preview === null || !preview.documentValid;
    refreshButton.disabled = busy;
    previewButton.disabled = busy;
    metadataButton.textContent = metadataVisible
      ? "Hide sync info"
      : "Show sync info";
    metadataButton.setAttribute("aria-pressed", String(metadataVisible));
    const previewLines =
      preview === null
        ? []
        : preview.plan.lines.map((line) =>
            line.kind === "action"
              ? `line ${line.line}: ${line.finalCategory}`
              : `${line.line === null ? "document" : `line ${line.line}`}: ${line.category}`,
          );
    const summaryCounts = summarizeResults(summary).counts;
    const summaryLines = Object.entries(summaryCounts).map(
      ([category, count]) => `${category}: ${count}`,
    );
    details.textContent = [...previewLines, ...summaryLines].join("\n");
  };

  const captureDraft = (): DraftRecord => ({
    dirty,
    markdown: editor.getValue(),
    sourceFingerprint: currentSourceFingerprint,
    stale,
    updatedAt: dependencies.now().toISOString(),
    version: 1,
  });

  const drainDraftPersistence = async (): Promise<void> => {
    while (active && pendingDraft !== null) {
      const draft = pendingDraft;
      pendingDraft = null;
      await saveDraft(dependencies.storage, draft);
    }
  };

  const persistDraft = (): Promise<void> => {
    pendingDraft = captureDraft();
    if (draftPersistence === null) {
      const running = drainDraftPersistence().then(
        () => {
          if (draftPersistence === running) draftPersistence = null;
        },
        (error: unknown) => {
          pendingDraft = null;
          if (draftPersistence === running) draftPersistence = null;
          throw error;
        },
      );
      draftPersistence = running;
    }
    return draftPersistence;
  };

  const reportDraftError = (error: unknown) => {
    if (!active) return;
    status.textContent =
      error instanceof StorageRecordError && error.code === "draft_too_large"
        ? "Draft is too large"
        : "Operation failed";
  };

  const installCleanSnapshot = async (
    snapshot: readonly WeeklyTodoSnapshot[],
  ): Promise<void> => {
    week = getWeekIdentity(dependencies.now(), settings.timezone);
    currentSourceFingerprint = await computeSourceFingerprint(
      snapshot,
      settings,
      week.id,
    );
    if (!active) return;
    editor.setValue(generateCanonicalMarkdown(snapshot));
    dirty = false;
    stale = false;
    preview = null;
    summary = [];
    await persistDraft();
    render();
  };

  if (persistInitialDraft) await persistDraft();
  render();

  const run = async (operation: () => Promise<void>) => {
    if (!active || busy) return;
    busy = true;
    render();
    try {
      await operation();
    } catch {
      if (active) {
        preview = null;
        status.textContent = "Operation failed";
      }
    } finally {
      if (active) {
        busy = false;
        render();
      }
    }
  };

  onEditorChange = () => {
    if (!active) return;
    dirty = true;
    preview = null;
    summary = [];
    void persistDraft().catch(reportDraftError);
    render();
  };

  const onSelect = () => {
    editor.selectAll();
  };
  selectButton.addEventListener("click", onSelect);

  const onToggleMetadata = () => {
    metadataVisible = !metadataVisible;
    editor.setMetadataVisible(metadataVisible);
    render();
  };
  metadataButton.addEventListener("click", onToggleMetadata);

  const refresh = async (confirmDirty: boolean) => {
    if (dirty && confirmDirty) {
      const confirmed = await dependencies.confirm(
        "Discard the current dirty Markdown draft and refresh from TodoFlowy?",
      );
      if (!active || !confirmed) return;
    }
    const snapshot = await dependencies.todos.readWeek(settings.timezone);
    if (!active) return;
    await installCleanSnapshot(snapshot);
  };
  const onRefresh = () => void run(() => refresh(true));
  refreshButton.addEventListener("click", onRefresh);

  const onPreview = () =>
    void run(async () => {
      const markdown = editor.getValue();
      const document = parseMarkdown(markdown);
      const snapshot = await dependencies.todos.readWeek(settings.timezone);
      if (!active) return;
      week = getWeekIdentity(dependencies.now(), settings.timezone);
      const plan = buildApplyPlan(document, snapshot);
      const fingerprint = await computePreviewFingerprint({
        markdown,
        plan,
        settings,
        snapshot,
        weekId: week.id,
      });
      if (!active) return;
      currentSourceFingerprint = await computeSourceFingerprint(
        snapshot,
        settings,
        week.id,
      );
      if (!active) return;
      stale = false;
      preview = {
        documentValid: document.kind === "valid",
        fingerprint,
        plan,
        snapshot,
        weekId: week.id,
      };
      await persistDraft();
    });
  previewButton.addEventListener("click", onPreview);

  const onApply = () =>
    void run(async () => {
      const approvedPreview = preview;
      if (approvedPreview === null || !approvedPreview.documentValid) return;
      const confirmed = await dependencies.confirm(
        `Apply ${approvedPreview.plan.lines.filter((line) => line.kind === "action").length} Markdown actions to TodoFlowy?`,
      );
      if (!active || !confirmed) return;
      const result = await executeApply({
        fingerprint: approvedPreview.fingerprint,
        gateway: dependencies.todos,
        isActive: () => active,
        markdown: editor.getValue(),
        plan: approvedPreview.plan,
        settings,
        snapshot: approvedPreview.snapshot,
        weekId: approvedPreview.weekId,
      });
      if (!active || result.kind === "disposed") return;
      if (result.kind === "stale") {
        preview = null;
        stale = true;
        await persistDraft();
        return;
      }
      summary = result.results;
      preview = null;
      if (result.canonicalMarkdown === null) {
        stale = true;
        render();
        return;
      }
      const snapshot = await dependencies.todos.readWeek(settings.timezone);
      if (!active) return;
      week = getWeekIdentity(dependencies.now(), settings.timezone);
      currentSourceFingerprint = await computeSourceFingerprint(
        snapshot,
        settings,
        week.id,
      );
      if (!active) return;
      editor.setValue(result.canonicalMarkdown);
      dirty = false;
      stale = false;
      await persistDraft();
    });
  applyButton.addEventListener("click", onApply);

  const unsubscribers = [
    dependencies.on("todos.changed", () => {
      if (!active) return;
      preview = null;
      if (dirty) {
        stale = true;
        void persistDraft().catch(reportDraftError);
        render();
      } else void run(() => refresh(false));
    }),
    dependencies.on("theme.changed", (payload) => {
      if (
        !active ||
        payload === null ||
        typeof payload !== "object" ||
        !("theme" in payload)
      )
        return;
      if (payload.theme === "light" || payload.theme === "dark")
        root.dataset.theme = payload.theme;
    }),
    dependencies.on("locale.changed", (payload) => {
      if (
        !active ||
        payload === null ||
        typeof payload !== "object" ||
        !("locale" in payload)
      )
        return;
      if (typeof payload.locale === "string")
        root.setAttribute("lang", payload.locale);
    }),
  ];

  return () => {
    if (!active) return;
    active = false;
    pendingDraft = null;
    editor.destroy();
    selectButton.removeEventListener("click", onSelect);
    metadataButton.removeEventListener("click", onToggleMetadata);
    refreshButton.removeEventListener("click", onRefresh);
    previewButton.removeEventListener("click", onPreview);
    applyButton.removeEventListener("click", onApply);
    for (const unsubscribe of unsubscribers) unsubscribe();
    root.replaceChildren();
  };
}

/* v8 ignore start -- the exported lifecycle wrapper requires a validated Runtime session */
export const { mount } = defineView({
  mount: (root) => mountTaskView(root, productionDependencies()),
});
/* v8 ignore stop */
