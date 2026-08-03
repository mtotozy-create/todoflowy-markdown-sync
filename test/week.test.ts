import { describe, expect, it } from "vitest";

import {
  getWeekIdentity,
  isValidTimeZone,
  resolveDefaultTimeZone,
} from "../src/core/week.js";

describe("weekly timezone identity", () => {
  it("validates IANA zones and falls back safely", () => {
    expect(isValidTimeZone("Asia/Shanghai")).toBe(true);
    expect(isValidTimeZone("Not/A_Zone")).toBe(false);
    expect(resolveDefaultTimeZone("Europe/Paris")).toBe("Europe/Paris");
    expect(resolveDefaultTimeZone("invalid")).toBe("UTC");
  });

  it("uses Monday boundaries in UTC", () => {
    expect(
      getWeekIdentity(new Date("2026-08-02T08:00:00.000Z"), "UTC"),
    ).toEqual({
      end: "2026-08-03T00:00:00.000Z",
      id: "UTC:2026-07-27/2026-08-03",
      start: "2026-07-27T00:00:00.000Z",
      timezone: "UTC",
    });
  });

  it("keeps local Monday midnights across daylight-saving changes", () => {
    expect(
      getWeekIdentity(new Date("2026-03-08T12:00:00.000Z"), "America/New_York"),
    ).toEqual({
      end: "2026-03-09T04:00:00.000Z",
      id: "America/New_York:2026-03-02/2026-03-09",
      start: "2026-03-02T05:00:00.000Z",
      timezone: "America/New_York",
    });
  });
});
