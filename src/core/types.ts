import type { PluginTodo, PluginTodoStatus } from "@todoflowy/plugin-contracts";

export type ActiveTodoStatus = Exclude<PluginTodoStatus, "cancelled">;

export interface MarkdownMetadata {
  readonly id: string;
  readonly revision: number;
  readonly status: ActiveTodoStatus;
}

export interface ParsedTaskLine {
  readonly checked: boolean;
  readonly kind: "task";
  readonly line: number;
  readonly metadata: MarkdownMetadata | null;
  readonly title: string;
}

export type InvalidLineCode =
  | "duplicate_metadata"
  | "empty_title"
  | "invalid_metadata"
  | "unrecognized";

export interface InvalidMarkdownLine {
  readonly code: InvalidLineCode;
  readonly kind: "invalid";
  readonly line: number;
}

export type ParsedMarkdownLine = ParsedTaskLine | InvalidMarkdownLine;

export type ParsedMarkdownDocument =
  | {
      readonly kind: "valid";
      readonly lines: readonly ParsedMarkdownLine[];
    }
  | {
      readonly code: "document_too_large" | "too_many_checkbox_lines";
      readonly kind: "invalid";
    };

export type CanonicalTodo = Pick<
  PluginTodo,
  "createdAt" | "dueTime" | "id" | "revision" | "startTime" | "status" | "title"
>;

export interface WeeklyTodoSnapshot {
  readonly createdAt: string;
  readonly dueTime: string | null;
  readonly id: string;
  readonly revision: number;
  readonly startTime: string | null;
  readonly status: ActiveTodoStatus;
  readonly title: string;
}
