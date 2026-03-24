import { describe, expect, it } from "vitest";

import {
  getReliabilityProfile,
  listReliabilityProfiles,
  parseReliabilityProfileName,
} from "./reliabilityProfiles.js";

describe("reliability profiles", () => {
  it("defines the expected named smoke, baseline, stress, spike, and soak profiles", () => {
    expect(listReliabilityProfiles().map((profile) => profile.name)).toEqual([
      "smoke",
      "baseline",
      "stress",
      "spike",
      "soak",
    ]);
  });

  it("gives each profile explicit load settings and threshold targets", () => {
    expect(getReliabilityProfile("smoke")).toEqual({
      description: "Fast local HTTP smoke probe for regressions.",
      name: "smoke",
      runner: "smoke",
      smoke: {
        concurrency: 1,
        requestCount: 5,
      },
      thresholds: {
        abortOnFail: false,
        maxErrorRate: 0,
        maxP95LatencyMs: 250,
        maxP99LatencyMs: 500,
      },
    });

    expect(getReliabilityProfile("baseline")).toMatchObject({
      name: "baseline",
      runner: "load",
      load: {
        durationSeconds: 60,
        preAllocatedVus: 5,
        maxVus: 10,
        targetVus: 5,
        warmupSeconds: 10,
      },
      thresholds: {
        abortOnFail: false,
        maxErrorRate: 0.01,
        maxP95LatencyMs: 500,
        maxP99LatencyMs: 1000,
      },
    });

    expect(getReliabilityProfile("stress")).toMatchObject({
      name: "stress",
      runner: "load",
      thresholds: {
        abortOnFail: true,
      },
    });
    expect(getReliabilityProfile("spike")).toMatchObject({
      name: "spike",
      runner: "load",
      thresholds: {
        abortOnFail: true,
      },
    });
    expect(getReliabilityProfile("soak")).toMatchObject({
      name: "soak",
      runner: "load",
      load: {
        durationSeconds: 900,
      },
    });
  });

  it("parses profile names and rejects unknown values", () => {
    expect(parseReliabilityProfileName("smoke")).toBe("smoke");
    expect(() => parseReliabilityProfileName("nope")).toThrow("Unknown reliability profile");
  });
});
