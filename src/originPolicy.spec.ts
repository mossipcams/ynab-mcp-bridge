import { describe, expect, it } from "vitest";

import { installCorsGuard, normalizeOrigin, resolveOriginPolicy } from "./originPolicy.js";

describe("originPolicy", () => {
  it("normalizes configured origins", () => {
    expect(normalizeOrigin("https://claude.ai:443/path")).toBe("https://claude.ai");
  });

  it("echoes exact allowed origins for browser requests", () => {
    const resolution = resolveOriginPolicy({
      allowedOrigins: new Set(["https://claude.ai"]),
      headers: {
        host: "mcp.example.com",
        origin: "https://claude.ai",
      },
    });

    expect(resolution).toEqual({
      allowed: true,
      responseOrigin: "https://claude.ai",
    });
  });

  it("allows loopback development origins when the request host is loopback", () => {
    const resolution = resolveOriginPolicy({
      allowedOrigins: new Set(),
      headers: {
        host: "127.0.0.1:3000",
        origin: "http://localhost:5173",
      },
    });

    expect(resolution).toEqual({
      allowed: true,
      responseOrigin: "http://localhost:5173",
    });
  });

  it("allows non-browser requests without a CORS origin", () => {
    const resolution = resolveOriginPolicy({
      allowedOrigins: new Set(["https://claude.ai"]),
      headers: {
        host: "mcp.example.com",
      },
    });

    expect(resolution).toEqual({
      allowed: true,
      responseOrigin: undefined,
    });
  });

  it("rejects opaque null origins by default", () => {
    const resolution = resolveOriginPolicy({
      allowedOrigins: new Set(["https://claude.ai"]),
      headers: {
        host: "mcp.example.com",
        origin: "null",
      },
    });

    expect(resolution).toEqual({
      allowed: false,
      responseOrigin: undefined,
    });
  });

  it("allows opaque null origins only with an explicit opt-in", () => {
    const resolution = resolveOriginPolicy({
      allowOpaqueNullOrigin: true,
      allowedOrigins: new Set(["https://claude.ai"]),
      headers: {
        host: "mcp.example.com",
        origin: "null",
      },
    });

    expect(resolution).toEqual({
      allowed: true,
      responseOrigin: undefined,
    });
  });

  it("rejects untrusted origins", () => {
    const resolution = resolveOriginPolicy({
      allowedOrigins: new Set(["https://claude.ai"]),
      headers: {
        host: "mcp.example.com",
        origin: "https://evil.example",
      },
    });

    expect(resolution).toEqual({
      allowed: false,
      responseOrigin: undefined,
    });
  });

});

describe("installCorsGuard", () => {
  it("overrides access-control-allow-origin with the resolved origin", () => {
    const recorded: Array<[string, unknown]> = [];
    const fakeRes = {
      setHeader(name: string, value: unknown) {
        recorded.push([name, value]);
        return fakeRes;
      },
    } as unknown as import("express").Response;

    installCorsGuard(fakeRes, "https://claude.ai");
    fakeRes.setHeader("access-control-allow-origin", "*");
    fakeRes.setHeader("content-type", "application/json");

    expect(recorded).toEqual([
      ["access-control-allow-origin", "https://claude.ai"],
      ["content-type", "application/json"],
    ]);
  });
});
