/**
 * Tests for the shared axis-helpers used by all formatters.
 */

import { describe, it, expect } from "vitest";
import type { AxisMeasurement } from "../types/measurement.js";
import type { MetricValue } from "../types/measurement.js";
import { axisName, axisNameById, axisDescription, colorizeValue } from "./axis-helpers.js";

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

function makeMetric(value: number, min: number, max: number | null): MetricValue {
  return {
    descriptor: {
      id: "test_metric",
      name: "Test Metric",
      unit: "percent",
      min,
      max,
      interpretation: "Test metric for color tests",
    },
    value,
  };
}

describe("colorizeValue", () => {
  it("returns the plain string for unbounded metrics (max is null)", () => {
    const metric = makeMetric(50, 0, null);
    const result = colorizeValue("50 percent", metric);
    expect(result).toBe("50 percent");
  });

  it("wraps value with ANSI color codes for bounded metrics", () => {
    const metric = makeMetric(50, 0, 100);
    const result = colorizeValue("50 percent", metric);
    // Should contain ANSI escape sequences
    expect(result).toMatch(/\x1b\[\d+m/);
    // Should still contain the original text
    expect(result).toContain("50 percent");
    // Should end with reset code
    expect(result).toContain("\x1b[0m");
  });

  it("uses low-range color for values in the lower third", () => {
    const metricLow = makeMetric(10, 0, 100);
    const metricHigh = makeMetric(90, 0, 100);
    const resultLow = colorizeValue("10 percent", metricLow);
    const resultHigh = colorizeValue("90 percent", metricHigh);
    // Different positions in the range should produce different colors
    expect(resultLow).not.toBe(resultHigh);
  });

  it("applies color to value at the minimum bound", () => {
    const metric = makeMetric(0, 0, 100);
    const result = colorizeValue("0 percent", metric);
    expect(result).toMatch(/\x1b\[\d+m/);
  });

  it("applies color to value at the maximum bound", () => {
    const metric = makeMetric(100, 0, 100);
    const result = colorizeValue("100 percent", metric);
    expect(result).toMatch(/\x1b\[\d+m/);
  });

  it("handles a zero-range metric (min equals max) without color", () => {
    const metric = makeMetric(5, 5, 5);
    const result = colorizeValue("5 percent", metric);
    expect(result).toBe("5 percent");
  });

  it("clamps values below the minimum", () => {
    const metric = makeMetric(-10, 0, 100);
    const result = colorizeValue("-10 percent", metric);
    // Should still apply color (clamped to min position)
    expect(result).toMatch(/\x1b\[\d+m/);
  });

  it("clamps values above the maximum", () => {
    const metric = makeMetric(150, 0, 100);
    const result = colorizeValue("150 percent", metric);
    // Should still apply color (clamped to max position)
    expect(result).toMatch(/\x1b\[\d+m/);
  });

  it("produces deterministic output for identical input", () => {
    const metric = makeMetric(42, 0, 100);
    const result1 = colorizeValue("42 percent", metric);
    const result2 = colorizeValue("42 percent", metric);
    expect(result1).toBe(result2);
  });
});
