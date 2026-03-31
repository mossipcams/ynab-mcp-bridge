import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("auth2 integration cleanup", () => {
  it("removes the auth stack selector and startup stack event", () => {
    const startupLoggingSource = readFileSync(new URL("../startupLogging.ts", import.meta.url), "utf8");
    const routeSource = readFileSync(new URL("./http/routes.ts", import.meta.url), "utf8");

    expect(startupLoggingSource).not.toContain("logAuthStackSelected");
    expect(startupLoggingSource).not.toContain("auth.stack.selected");
    expect(routeSource).not.toContain("authStack=v2");

    expect(() => readFileSync(new URL("./integration.ts", import.meta.url), "utf8")).toThrow();
  });
});
