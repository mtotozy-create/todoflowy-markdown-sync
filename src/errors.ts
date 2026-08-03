import type { PluginErrorCode } from "@todoflowy/plugin-contracts";

export function classifyOperationError(
  error: unknown,
): "conflict" | "failed" | "uncertain" {
  if (
    error === null ||
    typeof error !== "object" ||
    !("code" in error) ||
    typeof error.code !== "string"
  )
    return "uncertain";
  const code = error.code as PluginErrorCode;
  if (code === "CONFLICT") return "conflict";
  if (
    code === "TIMEOUT" ||
    code === "INSTANCE_DISPOSED" ||
    code === "INTERNAL_ERROR"
  )
    return "uncertain";
  if (
    code === "CAPABILITY_DENIED" ||
    code === "VALIDATION_FAILED" ||
    code === "NOT_FOUND" ||
    code === "OFFLINE_UNAVAILABLE" ||
    code === "RATE_LIMITED"
  )
    return "failed";
  return "uncertain";
}
