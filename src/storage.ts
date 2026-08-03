import type { JsonValue } from "@todoflowy/plugin-contracts";

import { MAX_MARKDOWN_BYTES } from "./core/markdown.js";
import { isValidTimeZone, resolveDefaultTimeZone } from "./core/week.js";

export const SETTINGS_KEY = "settings";
export const DRAFT_KEY = "draft";

export interface SettingsRecord {
  readonly timezone: string;
  readonly version: 1;
}

export interface DraftRecord {
  readonly dirty: boolean;
  readonly markdown: string;
  readonly sourceFingerprint: string | null;
  readonly stale: boolean;
  readonly updatedAt: string;
  readonly version: 1;
}

export interface StorageGateway {
  get(key: string): Promise<unknown>;
  set(key: string, value: JsonValue): Promise<void>;
}

export type StorageRecordErrorCode =
  | "draft_too_large"
  | "invalid_draft"
  | "invalid_settings"
  | "unsupported_draft_version"
  | "unsupported_settings_version";

export class StorageRecordError extends Error {
  readonly code: StorageRecordErrorCode;

  constructor(code: StorageRecordErrorCode) {
    super(code);
    this.name = "StorageRecordError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function loadSettings(
  storage: StorageGateway,
  defaultTimezone: string,
): Promise<SettingsRecord> {
  const fallback = resolveDefaultTimeZone(defaultTimezone);
  const value = await storage.get(SETTINGS_KEY);
  if (value === null || !isRecord(value) || value.version === undefined)
    return { timezone: fallback, version: 1 };
  if (value.version !== 1)
    throw new StorageRecordError("unsupported_settings_version");
  if (typeof value.timezone !== "string" || !isValidTimeZone(value.timezone))
    throw new StorageRecordError("invalid_settings");
  return { timezone: value.timezone, version: 1 };
}

export async function loadDraft(
  storage: StorageGateway,
): Promise<DraftRecord | null> {
  const value = await storage.get(DRAFT_KEY);
  if (value === null) return null;
  if (!isRecord(value)) throw new StorageRecordError("invalid_draft");
  if (value.version !== 1) {
    if (value.version !== undefined)
      throw new StorageRecordError("unsupported_draft_version");
    throw new StorageRecordError("invalid_draft");
  }
  if (
    typeof value.dirty !== "boolean" ||
    typeof value.markdown !== "string" ||
    (value.sourceFingerprint !== null &&
      typeof value.sourceFingerprint !== "string") ||
    typeof value.stale !== "boolean" ||
    typeof value.updatedAt !== "string"
  )
    throw new StorageRecordError("invalid_draft");
  if (new TextEncoder().encode(value.markdown).byteLength > MAX_MARKDOWN_BYTES)
    throw new StorageRecordError("draft_too_large");
  return {
    dirty: value.dirty,
    markdown: value.markdown,
    sourceFingerprint: value.sourceFingerprint,
    stale: value.stale,
    updatedAt: value.updatedAt,
    version: 1,
  };
}

export async function saveSettings(
  storage: StorageGateway,
  settings: SettingsRecord,
): Promise<void> {
  if (!isValidTimeZone(settings.timezone))
    throw new StorageRecordError("invalid_settings");
  await storage.set(SETTINGS_KEY, { ...settings });
}

export async function saveDraft(
  storage: StorageGateway,
  draft: DraftRecord,
): Promise<void> {
  if (new TextEncoder().encode(draft.markdown).byteLength > MAX_MARKDOWN_BYTES)
    throw new StorageRecordError("draft_too_large");
  await storage.set(DRAFT_KEY, { ...draft });
}
