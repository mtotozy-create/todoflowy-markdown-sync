import { defineView, plugin } from "@todoflowy/plugin-sdk";

import { isValidTimeZone, resolveDefaultTimeZone } from "./core/week.js";
import { button, element } from "./dom.js";
import {
  loadDraft,
  loadSettings,
  saveDraft,
  saveSettings,
  type StorageGateway,
} from "./storage.js";
import { TASK_VIEW_CSS } from "./task-view.css.js";

type SettingsEventType = "locale.changed" | "theme.changed";

export interface SettingsDependencies {
  readonly getLocale: () => Promise<string>;
  readonly getTheme: () => Promise<"dark" | "light">;
  readonly now: () => Date;
  readonly on: (
    type: SettingsEventType,
    listener: (payload: unknown) => void,
  ) => () => void;
  readonly storage: StorageGateway;
}

export async function mountSettingsView(
  root: HTMLElement,
  dependencies: SettingsDependencies,
): Promise<() => void> {
  let active = true;
  let saving = false;
  const [settings, theme, locale] = await Promise.all([
    loadSettings(dependencies.storage, resolveDefaultTimeZone()),
    dependencies.getTheme(),
    dependencies.getLocale(),
  ]);
  if (!active) return () => {};

  const style = element("style");
  style.textContent = TASK_VIEW_CSS;
  const container = element("section", { className: "markdown-sync" });
  const heading = element("h2", { text: "Markdown Sync settings" });
  const label = element("label", { text: "IANA timezone" });
  const input = element("input");
  input.id = "markdown-sync-timezone";
  input.value = settings.timezone;
  label.htmlFor = input.id;
  const saveButton = button("Save");
  const status = element("p", { className: "markdown-sync__status" });
  status.setAttribute("aria-live", "polite");
  container.append(heading, label, input, saveButton, status);
  root.replaceChildren(style, container);
  root.dataset.theme = theme;
  root.setAttribute("lang", locale);

  const onSave = () => {
    if (!active || saving) return;
    if (!isValidTimeZone(input.value)) {
      status.textContent = "Invalid timezone";
      return;
    }
    saving = true;
    saveButton.disabled = true;
    void (async () => {
      try {
        await saveSettings(dependencies.storage, {
          timezone: input.value,
          version: 1,
        });
        const draft = await loadDraft(dependencies.storage);
        if (!active) return;
        if (draft !== null)
          await saveDraft(dependencies.storage, {
            ...draft,
            stale: true,
            updatedAt: dependencies.now().toISOString(),
          });
        if (active) status.textContent = "Saved";
      } catch {
        if (active) status.textContent = "Save failed";
      } finally {
        if (active) {
          saving = false;
          saveButton.disabled = false;
        }
      }
    })();
  };
  saveButton.addEventListener("click", onSave);

  const unsubscribers = [
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
    saveButton.removeEventListener("click", onSave);
    for (const unsubscribe of unsubscribers) unsubscribe();
    root.replaceChildren();
  };
}

/* v8 ignore start -- production SDK lifecycle wiring is covered in Chromium */
export const { mount } = defineView({
  mount: (root) =>
    mountSettingsView(root, {
      getLocale: () => plugin.context.getLocale(),
      getTheme: () => plugin.theme.get(),
      now: () => new Date(),
      on: (type, listener) => plugin.events.on(type, listener as never),
      storage: plugin.storage,
    }),
});
/* v8 ignore stop */
