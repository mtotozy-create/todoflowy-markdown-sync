import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  Compartment,
  EditorSelection,
  EditorState,
  Transaction,
  type Extension,
  type Text,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
} from "@codemirror/view";

import {
  findCanonicalMetadataOffset,
  stripCanonicalMetadata,
} from "./core/markdown.js";

interface MetadataRange {
  readonly from: number;
  readonly to: number;
}

export interface MarkdownEditorController {
  destroy(): void;
  focus(): void;
  getValue(): string;
  selectAll(): void;
  setMetadataVisible(visible: boolean): void;
  setValue(value: string): void;
}

export interface MarkdownEditorOptions {
  readonly initialValue: string;
  readonly label: string;
  readonly onChange: () => void;
  readonly parent: HTMLElement;
}

function metadataRanges(doc: Text): readonly MetadataRange[] {
  const ranges: MetadataRange[] = [];
  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber += 1) {
    const line = doc.line(lineNumber);
    const offset = findCanonicalMetadataOffset(line.text);
    if (offset !== null) ranges.push({ from: line.from + offset, to: line.to });
  }
  return ranges;
}

function metadataDecorations(view: EditorView): DecorationSet {
  return Decoration.set(
    metadataRanges(view.state.doc).map(({ from, to }) =>
      Decoration.replace({}).range(from, to),
    ),
  );
}

function protectsMetadata(transaction: Transaction): boolean {
  if (!transaction.docChanged) return false;
  const doc = transaction.startState.doc;
  const ranges = metadataRanges(doc);
  let blocked = false;
  transaction.changes.iterChanges((from, to) => {
    for (const range of ranges) {
      const coversMetadata = from <= range.from && to >= range.to;
      const intersectsMetadata = from < range.to && to > range.from;
      const insertsInsideMetadata =
        from === to && from > range.from && from <= range.to;
      const removesFollowingLineBreak =
        range.to < doc.length && from <= range.to && to > range.to;
      if (
        !coversMetadata &&
        (intersectsMetadata ||
          insertsInsideMetadata ||
          removesFollowingLineBreak)
      ) {
        blocked = true;
        return;
      }
    }
  });
  return blocked;
}

function copiedText(state: EditorState): string {
  const selections = state.selection.ranges.filter((range) => !range.empty);
  if (selections.length > 0)
    return selections
      .map((range) => state.sliceDoc(range.from, range.to))
      .join(state.lineBreak);

  const lines: string[] = [];
  let lastLine = -1;
  for (const range of state.selection.ranges) {
    const line = state.doc.lineAt(range.from);
    if (line.number === lastLine) continue;
    lines.push(line.text);
    lastLine = line.number;
  }
  return lines.join(state.lineBreak);
}

function hiddenMetadataExtensions(): Extension {
  return [
    EditorView.decorations.of(metadataDecorations),
    EditorView.atomicRanges.of(metadataDecorations),
    EditorState.changeFilter.of((transaction) => !protectsMetadata(transaction)),
  ];
}

function detectLineSeparator(value: string): string | null {
  return value.match(/\r\n|\n|\r/)?.[0] ?? null;
}

export function createMarkdownEditor(
  options: MarkdownEditorOptions,
): MarkdownEditorController {
  const metadataCompartment = new Compartment();
  let metadataVisible = false;
  let sourceValue = options.initialValue;
  let sourceValueEdited = false;
  let suppressChanges = false;

  const createState = (value: string): EditorState => {
    const lineSeparator = detectLineSeparator(value);
    return EditorState.create({
      doc: value,
      extensions: [
        ...(lineSeparator === null
          ? []
          : [EditorState.lineSeparator.of(lineSeparator)]),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ "aria-label": options.label }),
        EditorView.domEventHandlers({
          copy(event, currentView) {
            if (event.clipboardData === null) return false;
            const text = copiedText(currentView.state);
            event.clipboardData.clearData();
            event.clipboardData.setData(
              "text/plain",
              metadataVisible ? text : stripCanonicalMetadata(text),
            );
            event.preventDefault();
            return true;
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !suppressChanges) {
            sourceValueEdited = true;
            options.onChange();
          }
        }),
        metadataCompartment.of(
          metadataVisible ? [] : hiddenMetadataExtensions(),
        ),
      ],
    });
  };

  const view = new EditorView({
    parent: options.parent,
    state: createState(options.initialValue),
  });

  return {
    destroy() {
      view.destroy();
    },
    focus() {
      view.focus();
    },
    getValue() {
      return sourceValueEdited ? view.state.sliceDoc() : sourceValue;
    },
    selectAll() {
      view.dispatch({
        scrollIntoView: true,
        selection: EditorSelection.single(0, view.state.doc.length),
        userEvent: "select",
      });
      view.focus();
    },
    setMetadataVisible(visible) {
      if (metadataVisible === visible) return;
      metadataVisible = visible;
      view.dispatch({
        effects: metadataCompartment.reconfigure(
          metadataVisible ? [] : hiddenMetadataExtensions(),
        ),
      });
    },
    setValue(value) {
      if (value === (sourceValueEdited ? view.state.sliceDoc() : sourceValue))
        return;
      suppressChanges = true;
      try {
        sourceValue = value;
        sourceValueEdited = false;
        view.setState(createState(value));
      } finally {
        suppressChanges = false;
      }
    },
  };
}
