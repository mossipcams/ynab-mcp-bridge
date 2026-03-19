import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logStartupFailure = vi.fn();

vi.mock("./startupLogging.js", () => ({
  logHttpServerStarted: vi.fn(),
  logStartupFailure,
}));

describe("index startup failure handling", () => {
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    logStartupFailure.mockReset();
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  it("forwards unknown startup failures to startup logging", async () => {
    const { handleStartupFailure } = await import("./index.js");
    const rejection = "boom";

    handleStartupFailure(rejection);

    expect(logStartupFailure).toHaveBeenCalledWith(rejection);
    expect(process.exitCode).toBe(1);
  });
});
