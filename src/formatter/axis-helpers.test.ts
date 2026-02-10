/**
 * Tests for the shared axis-helpers used by all formatters.
 */

import { describe, it, expect } from "vitest";
import type { AxisMeasurement } from "../types/measurement.js";
import { axisName, axisNameById, axisDescription } from "./axis-helpers.js";

function makeAxis(axisId: string): AxisMeasurement {
  return {
    axisId: axisId as AxisMeasurement["axisId"],
    summary: [],
    files: [],
  };
}

describe("axisName", () => {
  it("returns human-readable name for a known axis", () => {
    expect(axisName(makeAxis("complexity"))).toBe("Complexity");
  });

  it("returns human-readable name for each known axis", () => {
    expect(axisName(makeAxis("size"))).toBe("Size");
    expect(axisName(makeAxis("duplication"))).toBe("Duplication");
    expect(axisName(makeAxis("dead-code"))).toBe("Dead Code");
    expect(axisName(makeAxis("dependency-health"))).toBe("Dependency Health");
    expect(axisName(makeAxis("security"))).toBe("Security");
    expect(axisName(makeAxis("consistency"))).toBe("Consistency");
    expect(axisName(makeAxis("test-coverage"))).toBe("Test Coverage");
    expect(axisName(makeAxis("documentation"))).toBe("Documentation");
  });

  it("falls back to raw axisId for an unknown axis", () => {
    expect(axisName(makeAxis("unknown-axis"))).toBe("unknown-axis");
  });
});

describe("axisNameById", () => {
  it("returns human-readable name for a known axis id", () => {
    expect(axisNameById("complexity")).toBe("Complexity");
    expect(axisNameById("dead-code")).toBe("Dead Code");
    expect(axisNameById("dependency-health")).toBe("Dependency Health");
  });

  it("falls back to raw id for an unknown axis", () => {
    expect(axisNameById("unknown-axis" as never)).toBe("unknown-axis");
  });
});

describe("axisDescription", () => {
  it("returns description for a known axis", () => {
    expect(axisDescription(makeAxis("complexity"))).toBe(
      "Cyclomatic/cognitive complexity per function and file",
    );
  });

  it("returns description for each known axis", () => {
    expect(axisDescription(makeAxis("size"))).toBe(
      "Lines of code, file count, function length distribution",
    );
    expect(axisDescription(makeAxis("duplication"))).toBe(
      "Copy-paste detection across the codebase",
    );
  });

  it("returns empty string for an unknown axis", () => {
    expect(axisDescription(makeAxis("unknown-axis"))).toBe("");
  });
});
