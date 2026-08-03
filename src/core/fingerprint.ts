import type { ApplyPlan } from "./plan.js";
import type { WeeklyTodoSnapshot } from "./types.js";

export interface FingerprintSettings {
  readonly timezone: string;
  readonly version: 1;
}

export interface PreviewFingerprintInput {
  readonly markdown: string;
  readonly plan: ApplyPlan;
  readonly settings: FingerprintSettings;
  readonly snapshot: readonly WeeklyTodoSnapshot[];
  readonly weekId: string;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function computePreviewFingerprint(
  input: PreviewFingerprintInput,
): Promise<string> {
  const canonical = JSON.stringify({
    markdown: input.markdown,
    plan: input.plan.lines,
    settings: input.settings,
    snapshot: input.snapshot.map(({ id, revision }) => ({ id, revision })),
    version: 1,
    weekId: input.weekId,
  });
  return sha256(canonical);
}

export function computeSourceFingerprint(
  snapshot: readonly WeeklyTodoSnapshot[],
  settings: FingerprintSettings,
  weekId: string,
): Promise<string> {
  return sha256(
    JSON.stringify({
      settings,
      snapshot: snapshot.map(({ id, revision }) => ({ id, revision })),
      version: 1,
      weekId,
    }),
  );
}
