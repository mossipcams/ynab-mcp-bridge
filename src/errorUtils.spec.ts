import { describe, expect, it } from "vitest";

import { getErrorMessage } from "./tools/errorUtils.js";

describe("getErrorMessage", () => {
  it("returns plain string errors without JSON quoting", () => {
    expect(getErrorMessage("plain failure")).toBe("plain failure");
  });

  it("falls back to a generic message for empty Error instances", () => {
    expect(getErrorMessage(new Error(""))).toBe("Unknown error occurred");
  });
});
