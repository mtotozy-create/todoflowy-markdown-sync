export const TASK_VIEW_CSS = `
:host, .markdown-sync { color: CanvasText; font: 14px/1.5 system-ui, sans-serif; }
.markdown-sync { display: grid; gap: 12px; padding: 16px; }
.markdown-sync__meta, .markdown-sync__status { margin: 0; }
.markdown-sync__editor { box-sizing: border-box; height: 280px; min-height: 280px; overflow: auto; resize: vertical; width: 100%; }
.markdown-sync__editor .cm-editor { background: Canvas; color: CanvasText; height: 100%; }
.markdown-sync__editor .cm-scroller { font: 13px/1.5 ui-monospace, monospace; overflow: auto; }
.markdown-sync__editor .cm-content { min-height: 100%; }
.markdown-sync__controls { display: flex; flex-wrap: wrap; gap: 8px; }
.markdown-sync button { font: inherit; }
.markdown-sync button:focus-visible, .markdown-sync__editor .cm-focused { outline: 2px solid Highlight; outline-offset: 2px; }
.markdown-sync__details { margin: 0; white-space: pre-wrap; }
`;
