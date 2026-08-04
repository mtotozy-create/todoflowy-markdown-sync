/** @vitest-environment jsdom */

import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";

import { createMarkdownEditor } from "../src/markdown-editor.js";

const METADATA =
  " <!-- todoflowy:v1 id=00000000-0000-4000-8000-000000000001 rev=7 status=todo -->";

function fixture(value = `- [ ] Write report${METADATA}\n`) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const onChange = vi.fn();
  const controller = createMarkdownEditor({
    initialValue: value,
    label: "Markdown",
    onChange,
    parent,
  });
  const dom = parent.querySelector<HTMLElement>(".cm-editor");
  const view = dom === null ? null : EditorView.findFromDOM(dom);
  if (view === null) throw new Error("Missing CodeMirror view.");
  return {
    controller,
    onChange,
    parent,
    view,
    cleanup() {
      controller.destroy();
      parent.remove();
    },
  };
}

function copy(view: EditorView): string {
  const values = new Map<string, string>();
  const event = new Event("copy", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      clearData: () => values.clear(),
      setData: (type: string, value: string) => values.set(type, value),
    },
  });
  view.contentDOM.dispatchEvent(event);
  return values.get("text/plain") ?? "";
}

describe("Markdown editor", () => {
  it("hides valid metadata by default and exposes invalid metadata", () => {
    const invalid =
      "- [ ] Broken <!-- todoflowy:v2 id=00000000-0000-4000-8000-000000000002 rev=1 status=todo -->";
    const setup = fixture(`- [ ] Write report${METADATA}\n${invalid}`);

    expect(setup.view.state.sliceDoc()).toContain(METADATA);
    expect(setup.view.contentDOM.textContent).not.toContain("todoflowy:v1");
    expect(setup.view.contentDOM.textContent).toContain("todoflowy:v2");

    setup.controller.setMetadataVisible(true);
    expect(setup.view.contentDOM.textContent).toContain("todoflowy:v1");
    expect(setup.onChange).not.toHaveBeenCalled();
    setup.cleanup();
  });

  it("copies clean Markdown while hidden and complete Markdown while visible", () => {
    const setup = fixture();
    setup.view.dispatch({
      selection: EditorSelection.single(0, setup.view.state.doc.length),
    });

    expect(copy(setup.view)).toBe("- [ ] Write report\n");
    setup.controller.setMetadataVisible(true);
    expect(copy(setup.view)).toBe(`- [ ] Write report${METADATA}\n`);
    setup.cleanup();
  });

  it("keeps hidden metadata intact during title edits and blocks partial corruption", () => {
    const setup = fixture(`- [ ] Write report${METADATA}\n- [ ] Next${METADATA}`);
    const metadataStart = setup.view.state.sliceDoc().indexOf(METADATA);

    setup.view.dispatch({
      changes: { from: 6, insert: "Updated", to: 18 },
      userEvent: "input.type",
    });
    expect(setup.view.state.sliceDoc()).toContain(`Updated${METADATA}`);

    const afterTitleEdit = setup.view.state.sliceDoc();
    const protectedStart = afterTitleEdit.indexOf(METADATA);
    setup.view.dispatch({
      changes: { from: protectedStart, to: protectedStart + 1 },
      userEvent: "delete.forward",
    });
    expect(setup.view.state.sliceDoc()).toBe(afterTitleEdit);

    const lineBreak = afterTitleEdit.indexOf("\n");
    setup.view.dispatch({
      changes: { from: lineBreak, to: lineBreak + 1 },
      userEvent: "delete.forward",
    });
    expect(setup.view.state.sliceDoc()).toBe(afterTitleEdit);
    expect(metadataStart).toBeGreaterThan(0);
    setup.cleanup();
  });

  it("allows whole-line removal and raw metadata edits when visible", () => {
    const setup = fixture(`- [ ] First${METADATA}\n- [ ] Second${METADATA}`);
    const firstLineEnd = setup.view.state.sliceDoc().indexOf("\n") + 1;
    setup.view.dispatch({
      changes: { from: 0, to: firstLineEnd },
      userEvent: "delete.cut",
    });
    expect(setup.view.state.sliceDoc()).toBe(`- [ ] Second${METADATA}`);

    setup.controller.setMetadataVisible(true);
    const metadataStart = setup.view.state.sliceDoc().indexOf(METADATA);
    setup.view.dispatch({
      changes: { from: metadataStart, to: metadataStart + 1 },
      userEvent: "delete.forward",
    });
    expect(setup.view.state.sliceDoc()).not.toContain(METADATA);
    setup.cleanup();
  });

  it("preserves untouched source bytes and keeps programmatic changes silent", () => {
    const mixed = `- [ ] First${METADATA}\r\n- [ ] Second${METADATA}\n`;
    const setup = fixture(mixed);
    expect(setup.controller.getValue()).toBe(mixed);

    setup.controller.setValue(`- [ ] Replacement${METADATA}\n`);
    expect(setup.controller.getValue()).toBe(`- [ ] Replacement${METADATA}\n`);
    expect(setup.onChange).not.toHaveBeenCalled();
    setup.cleanup();
  });
});
