import type { ResultCategory } from "./plan.js";

export interface StableLineResult {
  readonly category: ResultCategory;
  readonly definiteSteps?: readonly ResultCategory[];
  readonly line: number | null;
  readonly title: string | null;
}

export interface ResultSummary {
  readonly counts: Partial<Record<ResultCategory, number>>;
  readonly results: readonly StableLineResult[];
}

export function summarizeResults(
  results: readonly StableLineResult[],
): ResultSummary {
  const counts: Partial<Record<ResultCategory, number>> = {};
  for (const item of results)
    counts[item.category] = (counts[item.category] ?? 0) + 1;
  const ordered = results
    .map((item, index) => ({ index, item }))
    .sort((left, right) => {
      if (left.item.line === right.item.line) return left.index - right.index;
      if (left.item.line === null) return -1;
      if (right.item.line === null) return 1;
      return left.item.line - right.item.line;
    })
    .map(({ item }) => item);
  return { counts, results: ordered };
}
