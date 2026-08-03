import type {
  PluginCreateTodoInput,
  PluginUpdateTodoInput,
} from "@todoflowy/plugin-contracts";

import { createMatchIndex } from "./match.js";
import type {
  ParsedMarkdownDocument,
  ParsedTaskLine,
  WeeklyTodoSnapshot,
} from "./types.js";

export type ResultCategory =
  | "created"
  | "updated"
  | "completed"
  | "reopened"
  | "unchanged"
  | "conflict"
  | "ambiguous"
  | "invalid"
  | "failed"
  | "uncertain";

export type PlanStep =
  | { readonly input: PluginCreateTodoInput; readonly type: "create" }
  | {
      readonly id: string;
      readonly input: PluginUpdateTodoInput;
      readonly type: "update";
    }
  | {
      readonly id: string;
      readonly reference: "snapshot";
      readonly revision: number;
      readonly type: "complete";
    }
  | { readonly reference: "previous"; readonly type: "complete" };

export interface ActionPlanLine {
  readonly finalCategory: "completed" | "created" | "reopened" | "updated";
  readonly kind: "action";
  readonly line: number;
  readonly steps: readonly PlanStep[];
  readonly title: string;
}

export interface ResultPlanLine {
  readonly category: "ambiguous" | "conflict" | "invalid" | "unchanged";
  readonly kind: "result";
  readonly line: number | null;
  readonly title: string | null;
}

export type ApplyPlanLine = ActionPlanLine | ResultPlanLine;

export interface ApplyPlan {
  readonly lines: readonly ApplyPlanLine[];
}

function result(
  line: number | null,
  title: string | null,
  category: ResultPlanLine["category"],
): ResultPlanLine {
  return { category, kind: "result", line, title };
}

function createPlan(line: ParsedTaskLine): ActionPlanLine {
  const create: PlanStep = { input: { title: line.title }, type: "create" };
  return {
    finalCategory: line.checked ? "completed" : "created",
    kind: "action",
    line: line.line,
    steps: line.checked
      ? [create, { reference: "previous", type: "complete" }]
      : [create],
    title: line.title,
  };
}

function matchedPlan(
  line: ParsedTaskLine,
  todo: WeeklyTodoSnapshot,
): ActionPlanLine | ResultPlanLine {
  const titleChanged = line.title !== todo.title;
  if (line.checked) {
    if (todo.status === "done") {
      if (!titleChanged) return result(line.line, line.title, "unchanged");
      return {
        finalCategory: "updated",
        kind: "action",
        line: line.line,
        steps: [
          {
            id: todo.id,
            input: { revision: todo.revision, title: line.title },
            type: "update",
          },
        ],
        title: line.title,
      };
    }
    const complete: PlanStep = titleChanged
      ? { reference: "previous", type: "complete" }
      : {
          id: todo.id,
          reference: "snapshot",
          revision: todo.revision,
          type: "complete",
        };
    return {
      finalCategory: "completed",
      kind: "action",
      line: line.line,
      steps: [
        ...(titleChanged
          ? [
              {
                id: todo.id,
                input: { revision: todo.revision, title: line.title },
                type: "update" as const,
              },
            ]
          : []),
        complete,
      ],
      title: line.title,
    };
  }

  if (todo.status === "done")
    return {
      finalCategory: "reopened",
      kind: "action",
      line: line.line,
      steps: [
        {
          id: todo.id,
          input: {
            revision: todo.revision,
            status: "todo",
            ...(titleChanged ? { title: line.title } : {}),
          },
          type: "update",
        },
      ],
      title: line.title,
    };

  if (!titleChanged) return result(line.line, line.title, "unchanged");
  return {
    finalCategory: "updated",
    kind: "action",
    line: line.line,
    steps: [
      {
        id: todo.id,
        input: { revision: todo.revision, title: line.title },
        type: "update",
      },
    ],
    title: line.title,
  };
}

export function buildApplyPlan(
  document: ParsedMarkdownDocument,
  snapshot: readonly WeeklyTodoSnapshot[],
): ApplyPlan {
  if (document.kind === "invalid")
    return { lines: [result(null, null, "invalid")] };
  const taskLines = document.lines.filter((line) => line.kind === "task");
  const index = createMatchIndex(taskLines, snapshot);
  const lines: ApplyPlanLine[] = [];

  for (const line of document.lines) {
    if (line.kind === "invalid") {
      lines.push(result(line.line, null, "invalid"));
      continue;
    }
    if (line.metadata !== null) {
      if ((index.metadataClaims.get(line.metadata.id) ?? 0) > 1) {
        lines.push(result(line.line, line.title, "ambiguous"));
        continue;
      }
      const todo = index.todosById.get(line.metadata.id);
      if (todo === undefined) {
        lines.push(result(line.line, line.title, "invalid"));
        continue;
      }
      if (
        todo.revision !== line.metadata.revision ||
        todo.status !== line.metadata.status
      ) {
        lines.push(result(line.line, line.title, "conflict"));
        continue;
      }
      lines.push(matchedPlan(line, todo));
      continue;
    }

    if ((index.titleClaims.get(line.title) ?? 0) > 1) {
      lines.push(result(line.line, line.title, "ambiguous"));
      continue;
    }
    const matches = index.todosByTitle.get(line.title) ?? [];
    if (matches.length > 1) {
      lines.push(result(line.line, line.title, "ambiguous"));
      continue;
    }
    const match = matches[0];
    lines.push(
      match === undefined ? createPlan(line) : matchedPlan(line, match),
    );
  }
  return { lines };
}
