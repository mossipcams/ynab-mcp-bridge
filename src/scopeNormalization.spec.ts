import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { getEffectiveOAuthScopes } from "./config.js";
import { normalizeScopes } from "./oauthGrant.js";

function trimUniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

describe("scope normalization", () => {
  it("keeps readable example coverage for offline access normalization", () => {
    expect(getEffectiveOAuthScopes([" profile ", "offline_access", "profile", "openid "])).toEqual([
      "profile",
      "offline_access",
      "openid",
    ]);
  });

  it("always returns trimmed unique scopes and includes offline_access exactly once", () => {
    fc.assert(fc.property(fc.array(fc.string()), (scopes) => {
      const result = getEffectiveOAuthScopes(scopes);
      const expectedScopes = new Set(trimUniqueNonEmpty(scopes));
      expectedScopes.add("offline_access");

      expect(result).toEqual([...new Set(result)]);
      expect(result.every((scope) => scope.length > 0 && scope === scope.trim())).toBe(true);
      expect(result.filter((scope) => scope === "offline_access")).toHaveLength(1);
      expect([...new Set(result)].sort()).toEqual([...expectedScopes].sort());
    }));
  });

  it("normalizes arbitrary scope arrays into a sorted unique trimmed set", () => {
    fc.assert(fc.property(fc.array(fc.string()), (scopes) => {
      expect(normalizeScopes(scopes)).toEqual(trimUniqueNonEmpty(scopes).sort());
    }));
  });
});
