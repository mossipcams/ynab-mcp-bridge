import { describe, expect, it } from "vitest";

import { getFirstHeaderValue, isLoopbackHostname } from "./headerUtils.js";

describe("getFirstHeaderValue", () => {
  it("returns undefined for undefined input", () => {
    expect(getFirstHeaderValue(undefined)).toBeUndefined();
  });

  it("returns a plain string value", () => {
    expect(getFirstHeaderValue("text/html")).toBe("text/html");
  });

  it("returns the first element from a string array", () => {
    expect(getFirstHeaderValue(["text/html", "application/json"])).toBe("text/html");
  });
});

describe("isLoopbackHostname", () => {
  it("returns true for localhost", () => {
    expect(isLoopbackHostname("localhost")).toBe(true);
  });
});
