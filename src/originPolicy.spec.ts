import { describe, expect, it } from "vitest";

import { normalizeOrigin, resolveOriginPolicy } from "./originPolicy.js";

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
      path: "/mcp",
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
      path: "/mcp",
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
      path: "/mcp",
    });

    expect(resolution).toEqual({
      allowed: true,
      responseOrigin: undefined,
    });
  });

  it("allows null origins only for oauth consent posts", () => {
    const resolution = resolveOriginPolicy({
      allowedOrigins: new Set(["https://claude.ai"]),
      headers: {
        host: "mcp.example.com",
        origin: "null",
      },
      path: "/authorize/consent",
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
      path: "/mcp",
    });

    expect(resolution).toEqual({
      allowed: false,
      responseOrigin: undefined,
    });
  });

  it("allows null origins for oauth consent posts", () => {
    const resolution = resolveOriginPolicy({
      allowedOrigins: new Set(["https://claude.ai"]),
      headers: {
        host: "mcp.example.com",
        origin: "null",
      },
      path: "/authorize/consent",
    });

    expect(resolution).toEqual({
      allowed: true,
      responseOrigin: undefined,
    });
  });

  it("still rejects null origins for non-oauth routes", () => {
    const resolution = resolveOriginPolicy({
      allowedOrigins: new Set(["https://claude.ai"]),
      headers: {
        host: "mcp.example.com",
        origin: "null",
      },
      path: "/mcp",
    });

    expect(resolution).toEqual({
      allowed: false,
      responseOrigin: undefined,
    });
  });
});
