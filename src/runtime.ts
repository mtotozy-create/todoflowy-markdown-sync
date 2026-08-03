import { defineRuntime, plugin } from "@todoflowy/plugin-sdk";

import { computeSourceFingerprint } from "./core/fingerprint.js";
import { generateCanonicalMarkdown } from "./core/markdown.js";
import type { WeeklyTodoSnapshot } from "./core/types.js";
import { getWeekIdentity, resolveDefaultTimeZone } from "./core/week.js";
import {
  loadDraft,
  loadSettings,
  saveDraft,
  type DraftRecord,
  type StorageGateway,
} from "./storage.js";
import { createTodoGateway } from "./todos.js";

export interface RuntimeDependencies {
  readonly now: () => Date;
  readonly onCommand: (listener: (payload: unknown) => void) => () => void;
  readonly readWeek: (
    timezone: string,
  ) => Promise<readonly WeeklyTodoSnapshot[]>;
  readonly storage: StorageGateway;
  readonly toast: (message: string) => Promise<void>;
}

export async function startMarkdownRuntime(
  dependencies: RuntimeDependencies,
): Promise<() => void> {
  let active = true;
  let running = false;

  const refresh = async () => {
    if (!active || running) return;
    running = true;
    try {
      const settings = await loadSettings(
        dependencies.storage,
        resolveDefaultTimeZone(),
      );
      const draft = await loadDraft(dependencies.storage);
      const snapshot = await dependencies.readWeek(settings.timezone);
      if (!active) return;
      const week = getWeekIdentity(dependencies.now(), settings.timezone);
      const fingerprint = await computeSourceFingerprint(
        snapshot,
        settings,
        week.id,
      );
      if (!active) return;
      const canonical = generateCanonicalMarkdown(snapshot);
      if (draft?.dirty) {
        const stale = draft.sourceFingerprint !== fingerprint;
        if (draft.stale !== stale)
          await saveDraft(dependencies.storage, {
            ...draft,
            stale,
            updatedAt: dependencies.now().toISOString(),
          });
        if (!active) return;
        await dependencies.toast(
          "Review the dirty Markdown draft in the task view.",
        );
        return;
      }

      const alreadyCurrent =
        draft !== null &&
        draft.markdown === canonical &&
        draft.sourceFingerprint === fingerprint &&
        !draft.stale;
      if (!alreadyCurrent) {
        const next: DraftRecord = {
          dirty: false,
          markdown: canonical,
          sourceFingerprint: fingerprint,
          stale: false,
          updatedAt: dependencies.now().toISOString(),
          version: 1,
        };
        await saveDraft(dependencies.storage, next);
      }
      if (!active) return;
      await dependencies.toast(
        alreadyCurrent
          ? "Markdown draft is already current."
          : "Markdown draft refreshed.",
      );
    } catch {
      if (active) await dependencies.toast("Markdown refresh failed.");
    } finally {
      running = false;
    }
  };

  const unsubscribe = dependencies.onCommand((payload) => {
    if (
      payload !== null &&
      typeof payload === "object" &&
      "command" in payload &&
      payload.command === "markdown.sync-now"
    )
      void refresh();
  });

  return () => {
    if (!active) return;
    active = false;
    unsubscribe();
  };
}

/* v8 ignore start -- production SDK lifecycle wiring is covered in Chromium */
let runtimeCleanup: (() => void) | undefined;
const gateway = createTodoGateway(plugin.todos);
export const { activate, deactivate } = defineRuntime({
  activate: async () => {
    runtimeCleanup = await startMarkdownRuntime({
      now: () => new Date(),
      onCommand: (listener) =>
        plugin.events.on("command.invoked", listener as never),
      readWeek: (timezone) => gateway.readWeek(timezone),
      storage: plugin.storage,
      toast: (message) => plugin.ui.toast({ message, variant: "info" }),
    });
  },
  deactivate: () => runtimeCleanup?.(),
});
/* v8 ignore stop */
