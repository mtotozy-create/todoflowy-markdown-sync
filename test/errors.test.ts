import { describe, expect, it } from "vitest";

import { classifyOperationError } from "../src/errors.js";

describe("stable operation errors", () => {
  it.each([
    ["CONFLICT", "conflict"],
    ["CAPABILITY_DENIED", "failed"],
    ["VALIDATION_FAILED", "failed"],
    ["NOT_FOUND", "failed"],
    ["OFFLINE_UNAVAILABLE", "failed"],
    ["RATE_LIMITED", "failed"],
    ["TIMEOUT", "uncertain"],
    ["INSTANCE_DISPOSED", "uncertain"],
    ["INTERNAL_ERROR", "uncertain"],
    ["INVALID_MESSAGE", "uncertain"],
    ["UNKNOWN", "uncertain"],
  ])("maps %s to %s", (code, category) => {
    expect(classifyOperationError({ code })).toBe(category);
  });

  it("treats raw exceptions as uncertain", () => {
    expect(classifyOperationError(new Error("private"))).toBe("uncertain");
  });
});
