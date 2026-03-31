import { describe, expect, it } from "vitest";

import {
  createPkcePair,
  verifyPkceCodeVerifier,
} from "./pkce.js";

describe("PKCE", () => {
  it("creates an S256 PKCE pair", () => {
    const pair = createPkcePair();

    expect(pair.method).toBe("S256");
    expect(pair.verifier.length).toBeGreaterThanOrEqual(43);
    expect(pair.challenge.length).toBeGreaterThan(0);
    expect(pair.challenge).not.toBe(pair.verifier);
  });

  it("accepts the matching code verifier", () => {
    const pair = createPkcePair();

    expect(verifyPkceCodeVerifier(pair.verifier, pair.challenge)).toEqual({
      method: "S256",
      valid: true,
    });
  });

  it("rejects an invalid code verifier", () => {
    const pair = createPkcePair();

    expect(() => verifyPkceCodeVerifier(`${pair.verifier}x`, pair.challenge)).toThrow(
      "PKCE code_verifier is invalid.",
    );
  });
});
