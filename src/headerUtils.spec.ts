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

  it("returns undefined for blank header values", () => {
    expect(getFirstHeaderValue("   ")).toBeUndefined();
    expect(getFirstHeaderValue(["   ", "application/json"])).toBeUndefined();
  });
});

describe("isLoopbackHostname", () => {
  it("returns true for localhost", () => {
    expect(isLoopbackHostname("localhost")).toBe(true);
  });

  it("returns true for loopback hosts that include an explicit port", () => {
    expect(isLoopbackHostname("localhost:3000")).toBe(true);
    expect(isLoopbackHostname("127.0.0.1:3000")).toBe(true);
    expect(isLoopbackHostname("[::1]:3000")).toBe(true);
  });
});
