import { beforeEach, describe, expect, it, vi } from "vitest";

const logStartupFailure = vi.fn();

vi.mock("./startupLogging.js", () => ({
  logHttpServerStarted: vi.fn(),
  logStartupFailure,
}));

describe("index startup failure handling", () => {
  beforeEach(() => {
    logStartupFailure.mockReset();
  });

  it("forwards unknown startup failures to startup logging", async () => {
    const { handleStartupFailure } = await import("./index.js");
    const rejection = "boom";

    handleStartupFailure(rejection);

    expect(logStartupFailure).toHaveBeenCalledWith(rejection);
  });
});
