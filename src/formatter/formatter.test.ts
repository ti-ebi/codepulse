/**
 * Tests for the Formatter interface and JSON formatter.
 */

import { describe, it, expect } from "vitest";
import type { MeasurementReport } from "../types/measurement.js";
import type { Formatter } from "./formatter.js";
import { formatJson } from "./json.js";

function makeReport(overrides?: Partial<MeasurementReport>): MeasurementReport {
  return {
    targetPath: "/project",
    timestamp: "2025-01-15T10:00:00.000Z",
    axes: [],
    warnings: [],
    ...overrides,
  };
}

describe("Formatter interface", () => {
  it("formatJson satisfies the Formatter type", () => {
    const formatter: Formatter = formatJson;
    expect(typeof formatter).toBe("function");
  });
});

describe("formatJson", () => {
  it("returns valid JSON for an empty report", () => {
    const report = makeReport();
    const output = formatJson(report);
    const parsed: unknown = JSON.parse(output);
    expect(parsed).toEqual({
      targetPath: "/project",
      timestamp: "2025-01-15T10:00:00.000Z",
      axes: [],
      warnings: [],
    });
  });

  it("includes metric metadata in axis summary", () => {
    const report = makeReport({
      axes: [
        {
          axisId: "size",
          summary: [
            {
              descriptor: {
                id: "total_lines",
                name: "Total Lines",
                unit: "lines",
                min: 0,
                max: null,
                interpretation:
                  "Total number of lines across all files",
              },
              value: 1500,
            },
          ],
          files: [],
        },
      ],
    });

    const parsed = JSON.parse(formatJson(report)) as Record<string, unknown>;
    const axes = parsed["axes"] as Array<Record<string, unknown>>;
    expect(axes).toHaveLength(1);

    const sizeAxis = axes[0]!;
    expect(sizeAxis["axisId"]).toBe("size");

    const summary = sizeAxis["summary"] as Array<Record<string, unknown>>;
    expect(summary).toHaveLength(1);

    const metric = summary[0]!;
    expect(metric["value"]).toBe(1500);

    const descriptor = metric["descriptor"] as Record<string, unknown>;
    expect(descriptor["id"]).toBe("total_lines");
    expect(descriptor["unit"]).toBe("lines");
    expect(descriptor["min"]).toBe(0);
    expect(descriptor["max"]).toBeNull();
    expect(descriptor["interpretation"]).toBe(
      "Total number of lines across all files",
    );
  });

  it("includes per-file measurements", () => {
    const report = makeReport({
      axes: [
        {
          axisId: "complexity",
          summary: [],
          files: [
            {
              filePath: "/project/src/main.ts",
              metrics: [
                {
                  descriptor: {
                    id: "cyclomatic",
                    name: "Cyclomatic Complexity",
                    unit: "count",
                    min: 1,
                    max: null,
                    interpretation:
                      "Number of linearly independent paths through the function",
                  },
                  value: 12,
                },
              ],
            },
          ],
        },
      ],
    });

    const parsed = JSON.parse(formatJson(report)) as Record<string, unknown>;
    const axes = parsed["axes"] as Array<Record<string, unknown>>;
    const complexityAxis = axes[0]!;
    const files = complexityAxis["files"] as Array<Record<string, unknown>>;
    expect(files).toHaveLength(1);

    const file = files[0]!;
    expect(file["filePath"]).toBe("/project/src/main.ts");

    const metrics = file["metrics"] as Array<Record<string, unknown>>;
    const metric = metrics[0]!;
    expect(metric["value"]).toBe(12);

    const descriptor = metric["descriptor"] as Record<string, unknown>;
    expect(descriptor["id"]).toBe("cyclomatic");
    expect(descriptor["min"]).toBe(1);
  });

  it("preserves multiple axes in order", () => {
    const report = makeReport({
      axes: [
        {
          axisId: "size",
          summary: [
            {
              descriptor: {
                id: "total_files",
                name: "Total Files",
                unit: "count",
                min: 0,
                max: null,
                interpretation: "Number of source files",
              },
              value: 42,
            },
          ],
          files: [],
        },
        {
          axisId: "duplication",
          summary: [
            {
              descriptor: {
                id: "duplication_percent",
                name: "Duplication Percentage",
                unit: "percent",
                min: 0,
                max: 100,
                interpretation:
                  "Percentage of code that is duplicated",
              },
              value: 8.5,
            },
          ],
          files: [],
        },
      ],
    });

    const parsed = JSON.parse(formatJson(report)) as Record<string, unknown>;
    const axes = parsed["axes"] as Array<Record<string, unknown>>;
    expect(axes).toHaveLength(2);
    expect(axes[0]!["axisId"]).toBe("size");
    expect(axes[1]!["axisId"]).toBe("duplication");
  });

  it("produces deterministic output for identical input", () => {
    const report = makeReport({
      axes: [
        {
          axisId: "size",
          summary: [
            {
              descriptor: {
                id: "total_lines",
                name: "Total Lines",
                unit: "lines",
                min: 0,
                max: null,
                interpretation: "Total number of lines",
              },
              value: 100,
            },
          ],
          files: [],
        },
      ],
    });

    const output1 = formatJson(report);
    const output2 = formatJson(report);
    expect(output1).toBe(output2);
  });

  it("produces formatted JSON with 2-space indentation", () => {
    const report = makeReport();
    const output = formatJson(report);
    // Formatted JSON should contain newlines
    expect(output).toContain("\n");
    // Should use 2-space indentation
    expect(output).toContain('  "targetPath"');
  });

  it("includes warnings in JSON output", () => {
    const report = makeReport({
      warnings: [
        { axisId: "security", message: 'No available adapter for axis "security"' },
        { axisId: "consistency", message: 'Adapter "eslint" failed: tool crashed' },
      ],
    });

    const parsed = JSON.parse(formatJson(report)) as Record<string, unknown>;
    const warnings = parsed["warnings"] as Array<Record<string, unknown>>;
    expect(warnings).toHaveLength(2);
    expect(warnings[0]!["axisId"]).toBe("security");
    expect(warnings[0]!["message"]).toContain("No available adapter");
    expect(warnings[1]!["axisId"]).toBe("consistency");
    expect(warnings[1]!["message"]).toContain("failed");
  });

  it("includes empty warnings array when no warnings exist", () => {
    const report = makeReport();
    const parsed = JSON.parse(formatJson(report)) as Record<string, unknown>;
    expect(parsed["warnings"]).toEqual([]);
  });

  it("includes axis name and description from registry in each axis entry", () => {
    const report = makeReport({
      axes: [
        {
          axisId: "dead-code",
          summary: [],
          files: [],
        },
      ],
    });

    const parsed = JSON.parse(formatJson(report)) as Record<string, unknown>;
    const axes = parsed["axes"] as Array<Record<string, unknown>>;
    expect(axes).toHaveLength(1);

    const axis = axes[0]!;
    expect(axis["axisId"]).toBe("dead-code");
    expect(axis["axisName"]).toBe("Dead Code");
    expect(axis["axisDescription"]).toBe(
      "Unused exports, unreachable code, orphaned files",
    );
  });

  it("includes axis name and description for all known axes", () => {
    const report = makeReport({
      axes: [
        { axisId: "complexity", summary: [], files: [] },
        { axisId: "size", summary: [], files: [] },
        { axisId: "dependency-health", summary: [], files: [] },
      ],
    });

    const parsed = JSON.parse(formatJson(report)) as Record<string, unknown>;
    const axes = parsed["axes"] as Array<Record<string, unknown>>;

    expect(axes[0]!["axisName"]).toBe("Complexity");
    expect(axes[0]!["axisDescription"]).toBe(
      "Cyclomatic/cognitive complexity per function and file",
    );

    expect(axes[1]!["axisName"]).toBe("Size");
    expect(axes[1]!["axisDescription"]).toBe(
      "Lines of code, file count, function length distribution",
    );

    expect(axes[2]!["axisName"]).toBe("Dependency Health");
    expect(axes[2]!["axisDescription"]).toBe(
      "Dependency graph depth, circular dependencies",
    );
  });

  it("falls back to axisId for name when axis is unknown", () => {
    const report = makeReport({
      axes: [
        {
          axisId: "unknown-axis" as import("../types/axis.js").AxisId,
          summary: [],
          files: [],
        },
      ],
    });

    const parsed = JSON.parse(formatJson(report)) as Record<string, unknown>;
    const axes = parsed["axes"] as Array<Record<string, unknown>>;
    const axis = axes[0]!;
    expect(axis["axisName"]).toBe("unknown-axis");
    expect(axis["axisDescription"]).toBe("");
  });

  it("includes axis name in warning entries", () => {
    const report = makeReport({
      warnings: [
        { axisId: "security", message: 'No available adapter for axis "security"' },
      ],
    });

    const parsed = JSON.parse(formatJson(report)) as Record<string, unknown>;
    const warnings = parsed["warnings"] as Array<Record<string, unknown>>;
    expect(warnings[0]!["axisName"]).toBe("Security");
  });
});
