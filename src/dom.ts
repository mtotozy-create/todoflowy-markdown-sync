export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: {
    readonly className?: string;
    readonly text?: string;
    readonly type?: HTMLButtonElement["type"];
  } = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className !== undefined) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.type !== undefined && node instanceof HTMLButtonElement)
    node.type = options.type;
  return node;
}

export function button(label: string): HTMLButtonElement {
  return element("button", { text: label, type: "button" });
}
