import type {
  CanonicalTodo,
  MarkdownMetadata,
  ParsedMarkdownDocument,
  ParsedMarkdownLine,
} from "./types.js";

export const MAX_MARKDOWN_BYTES = 192 * 1024;
export const MAX_CHECKBOX_LINES = 500;

const METADATA_SENTINEL = "<!-- todoflowy:";
const UUID_PATTERN =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const METADATA_PATTERN = new RegExp(
  ` <!-- todoflowy:v1 id=(${UUID_PATTERN}) rev=(0|[1-9]\\d*) status=(todo|in_progress|done) -->$`,
);
const CHECKBOX_PATTERN = /^[-*+] +\[([ xX])\] +(.*)$/;
const CHECKBOX_PREFIX_PATTERN = /^[-*+] +\[[ xX]\]/;

function countUnescapedSentinels(value: string): number {
  let count = 0;
  let offset = 0;
  while (offset < value.length) {
    const index = value.indexOf(METADATA_SENTINEL, offset);
    if (index === -1) break;
    let backslashes = 0;
    for (
      let cursor = index - 1;
      cursor >= 0 && value[cursor] === "\\";
      cursor -= 1
    )
      backslashes += 1;
    if (backslashes % 2 === 0) count += 1;
    offset = index + METADATA_SENTINEL.length;
  }
  return count;
}

function escapeTitle(title: string): string {
  return title
    .replaceAll("\\", "\\\\")
    .replaceAll("\r", "\\r")
    .replaceAll("\n", "\\n")
    .replaceAll(METADATA_SENTINEL, `\\${METADATA_SENTINEL}`);
}

function unescapeTitle(title: string): string {
  let result = "";
  for (let index = 0; index < title.length; index += 1) {
    if (title[index] !== "\\") {
      result += title[index];
      continue;
    }
    if (title.startsWith(`\\${METADATA_SENTINEL}`, index)) {
      result += METADATA_SENTINEL;
      index += METADATA_SENTINEL.length;
      continue;
    }
    const next = title[index + 1];
    if (next === "\\") {
      result += "\\";
      index += 1;
    } else if (next === "r") {
      result += "\r";
      index += 1;
    } else if (next === "n") {
      result += "\n";
      index += 1;
    } else {
      result += "\\";
    }
  }
  return result;
}

function parseMetadata(value: string): {
  readonly metadata: MarkdownMetadata | null;
  readonly title: string;
} | null {
  const sentinelCount = countUnescapedSentinels(value);
  if (sentinelCount > 1) return null;
  if (sentinelCount === 0) return { metadata: null, title: value };
  const match = METADATA_PATTERN.exec(value);
  if (match === null) return null;
  const id = match[1];
  const revision = match[2];
  const status = match[3];
  if (id === undefined || revision === undefined || status === undefined)
    return null;
  return {
    metadata: {
      id,
      revision: Number(revision),
      status: status as MarkdownMetadata["status"],
    },
    title: value.slice(0, match.index),
  };
}

export function parseMarkdown(markdown: string): ParsedMarkdownDocument {
  if (new TextEncoder().encode(markdown).byteLength > MAX_MARKDOWN_BYTES)
    return { code: "document_too_large", kind: "invalid" };

  const sourceLines = markdown.split(/\r\n|\n|\r/);
  const checkboxCount = sourceLines.reduce(
    (count, line) => count + (CHECKBOX_PREFIX_PATTERN.test(line) ? 1 : 0),
    0,
  );
  if (checkboxCount > MAX_CHECKBOX_LINES)
    return { code: "too_many_checkbox_lines", kind: "invalid" };

  const lines: ParsedMarkdownLine[] = [];
  for (const [index, sourceLine] of sourceLines.entries()) {
    if (sourceLine.trim() === "") continue;
    const checkbox = CHECKBOX_PATTERN.exec(sourceLine);
    if (checkbox === null) {
      lines.push({ code: "unrecognized", kind: "invalid", line: index + 1 });
      continue;
    }
    const parsedMetadata = parseMetadata(checkbox[2] ?? "");
    if (parsedMetadata === null) {
      lines.push({
        code:
          countUnescapedSentinels(checkbox[2] ?? "") > 1
            ? "duplicate_metadata"
            : "invalid_metadata",
        kind: "invalid",
        line: index + 1,
      });
      continue;
    }
    const escapedTitle = parsedMetadata.title.trim();
    if (escapedTitle === "") {
      lines.push({ code: "empty_title", kind: "invalid", line: index + 1 });
      continue;
    }
    lines.push({
      checked: checkbox[1] !== " ",
      kind: "task",
      line: index + 1,
      metadata: parsedMetadata.metadata,
      title: unescapeTitle(escapedTitle),
    });
  }
  return { kind: "valid", lines };
}

function compareNullable(left: string | null, right: string | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left < right ? -1 : 1;
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function compareTodos(left: CanonicalTodo, right: CanonicalTodo): number {
  return (
    compareNullable(left.dueTime, right.dueTime) ||
    compareNullable(left.startTime, right.startTime) ||
    compareText(left.createdAt, right.createdAt) ||
    compareText(left.id, right.id)
  );
}

export function generateCanonicalMarkdown(
  todos: readonly CanonicalTodo[],
): string {
  const lines = todos
    .filter((todo) => todo.status !== "cancelled")
    .sort(compareTodos)
    .map(
      (todo) =>
        `- [${todo.status === "done" ? "x" : " "}] ${escapeTitle(todo.title)} <!-- todoflowy:v1 id=${todo.id} rev=${todo.revision} status=${todo.status} -->`,
    );
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}
