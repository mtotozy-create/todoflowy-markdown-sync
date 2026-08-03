import type { PluginTodo } from "@todoflowy/plugin-contracts";

import {
  computePreviewFingerprint,
  type FingerprintSettings,
} from "./core/fingerprint.js";
import { generateCanonicalMarkdown, parseMarkdown } from "./core/markdown.js";
import {
  buildApplyPlan,
  type ActionPlanLine,
  type ApplyPlan,
  type PlanStep,
  type ResultCategory,
} from "./core/plan.js";
import type { StableLineResult } from "./core/summary.js";
import type { WeeklyTodoSnapshot } from "./core/types.js";
import { classifyOperationError } from "./errors.js";
import type { TodoGateway } from "./todos.js";

export interface ExecuteApplyOptions {
  readonly fingerprint: string;
  readonly gateway: TodoGateway;
  readonly isActive?: () => boolean;
  readonly markdown: string;
  readonly plan: ApplyPlan;
  readonly settings: FingerprintSettings;
  readonly snapshot: readonly WeeklyTodoSnapshot[];
  readonly weekId: string;
}

export type ApplyExecutionResult =
  | { readonly kind: "disposed" }
  | {
      readonly fingerprint: string;
      readonly kind: "stale";
      readonly plan: ApplyPlan;
    }
  | {
      readonly canonicalMarkdown: string | null;
      readonly kind: "applied";
      readonly results: readonly StableLineResult[];
    };

function stepCategory(step: PlanStep): ResultCategory {
  if (step.type === "create") return "created";
  if (step.type === "update") return "updated";
  return "completed";
}

async function executeLine(
  line: ActionPlanLine,
  gateway: TodoGateway,
  isActive: () => boolean,
): Promise<
  { readonly disposed: true } | { readonly result: StableLineResult }
> {
  let previous: PluginTodo | undefined;
  const definiteSteps: ResultCategory[] = [];
  for (const step of line.steps) {
    try {
      if (step.type === "create") previous = await gateway.create(step.input);
      else if (step.type === "update")
        previous = await gateway.update(step.id, step.input);
      else if (step.reference === "snapshot")
        previous = await gateway.complete(step.id, step.revision);
      else {
        if (previous === undefined)
          throw new Error("Missing previous Todo result.");
        previous = await gateway.complete(previous.id, previous.revision);
      }
      if (!isActive()) return { disposed: true };
      definiteSteps.push(stepCategory(step));
    } catch (error) {
      if (!isActive()) return { disposed: true };
      const category = classifyOperationError(error);
      return {
        result: {
          category,
          ...(definiteSteps.length === 0 ? {} : { definiteSteps }),
          line: line.line,
          title: line.title,
        },
      };
    }
  }
  return {
    result: {
      category: line.finalCategory,
      ...(definiteSteps.length > 1
        ? { definiteSteps: definiteSteps.slice(0, -1) }
        : {}),
      line: line.line,
      title: line.title,
    },
  };
}

export async function executeApply(
  options: ExecuteApplyOptions,
): Promise<ApplyExecutionResult> {
  const isActive = options.isActive ?? (() => true);
  if (!isActive()) return { kind: "disposed" };

  const currentSnapshot = await options.gateway.readWeek(
    options.settings.timezone,
  );
  if (!isActive()) return { kind: "disposed" };
  const currentPlan = buildApplyPlan(
    parseMarkdown(options.markdown),
    currentSnapshot,
  );
  const currentFingerprint = await computePreviewFingerprint({
    markdown: options.markdown,
    plan: currentPlan,
    settings: options.settings,
    snapshot: currentSnapshot,
    weekId: options.weekId,
  });
  if (!isActive()) return { kind: "disposed" };
  if (currentFingerprint !== options.fingerprint)
    return {
      fingerprint: currentFingerprint,
      kind: "stale",
      plan: currentPlan,
    };

  const results: StableLineResult[] = [];
  let uncertain = false;
  for (const line of currentPlan.lines) {
    if (line.kind === "result") {
      results.push({
        category: line.category,
        line: line.line,
        title: line.title,
      });
      continue;
    }
    if (uncertain) break;
    const execution = await executeLine(line, options.gateway, isActive);
    if ("disposed" in execution) return { kind: "disposed" };
    results.push(execution.result);
    uncertain = execution.result.category === "uncertain";
  }

  if (!isActive()) return { kind: "disposed" };
  try {
    const refreshed = await options.gateway.readWeek(options.settings.timezone);
    if (!isActive()) return { kind: "disposed" };
    return {
      canonicalMarkdown: generateCanonicalMarkdown(refreshed),
      kind: "applied",
      results,
    };
  } catch (error) {
    if (!isActive()) return { kind: "disposed" };
    results.unshift({
      category: classifyOperationError(error),
      line: null,
      title: null,
    });
    return { canonicalMarkdown: null, kind: "applied", results };
  }
}
