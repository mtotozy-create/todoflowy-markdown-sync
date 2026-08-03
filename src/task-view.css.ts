export const TASK_VIEW_CSS = `
:host, .markdown-sync { color: CanvasText; font: 14px/1.5 system-ui, sans-serif; }
.markdown-sync { display: grid; gap: 12px; padding: 16px; }
.markdown-sync__meta, .markdown-sync__status { margin: 0; }
.markdown-sync__editor { box-sizing: border-box; min-height: 280px; resize: vertical; width: 100%; font: 13px/1.5 ui-monospace, monospace; }
.markdown-sync__controls { display: flex; flex-wrap: wrap; gap: 8px; }
.markdown-sync button, .markdown-sync textarea { font: inherit; }
.markdown-sync button:focus-visible, .markdown-sync textarea:focus-visible { outline: 2px solid Highlight; outline-offset: 2px; }
.markdown-sync__details { margin: 0; white-space: pre-wrap; }
`;
