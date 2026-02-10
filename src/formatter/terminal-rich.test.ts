/**
 * Tests for the terminal-rich formatter.
 *
 * The terminal-rich formatter produces a detailed breakdown with
 * visual indicators, including per-file metrics. It contrasts with
 * terminal-compact which shows only summary-level data.
 */

import { describe, it, expect } from "vitest";
import type { MeasurementReport } from "../types/measurement.js";
import type { Formatter } from "./formatter.js";
import { formatTerminalRich } from "./terminal-rich.js";

function makeReport(overrides?: Partial<MeasurementReport>): MeasurementReport {
  return {
    targetPath: "/project",
    timestamp: "2025-01-15T10:00:00.000Z",
    axes: [],
    warnings: [],
    ...overrides,
  };
}

describe("formatTerminalRich", () => {
  it("satisfies the Formatter type", () => {
    const formatter: Formatter = formatTerminalRich;
    expect(typeof formatter).toBe("function");
  });

  it("returns a string for an empty report", () => {
    const report = makeReport();
    const output = formatTerminalRich(report);
    expect(typeof output).toBe("string");
    expect(output.length).toBeGreaterThan(0);
  });

  it("includes the target path in output", () => {
    const report = makeReport({ targetPath: "/my/project" });
    const output = formatTerminalRich(report);
    expect(output).toContain("/my/project");
  });

  it("includes the timestamp in output", () => {
    const report = makeReport({ timestamp: "2025-06-01T12:00:00.000Z" });
    const output = formatTerminalRich(report);
    expect(output).toContain("2025-06-01T12:00:00.000Z");
  });

  it("shows 'No axes measured.' for empty axes", () => {
    const report = makeReport();
    const output = formatTerminalRich(report);
    expect(output).toContain("No axes measured.");
  });

  it("includes axis name and summary metric values", () => {
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
                interpretation: "Total number of lines across all files",
              },
              value: 1500,
            },
          ],
          files: [],
        },
      ],
    });

    const output = formatTerminalRich(report);
    expect(output).toContain("Size");
    expect(output).toContain("Total Lines");
    expect(output).toContain("1500");
  });

  it("displays metric unit alongside value", () => {
    const report = makeReport({
      axes: [
        {
          axisId: "duplication",
          summary: [
            {
              descriptor: {
                id: "duplication_percent",
                name: "Duplication",
                unit: "percent",
                min: 0,
                max: 100,
                interpretation: "Percentage of code that is duplicated",
              },
              value: 8.5,
            },
          ],
          files: [],
        },
      ],
    });

    const output = formatTerminalRich(report);
    expect(output).toContain("8.5");
    expect(output).toContain("percent");
  });

  it("displays multiple axes with visual separation", () => {
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
          axisId: "complexity",
          summary: [
            {
              descriptor: {
                id: "avg_cyclomatic",
                name: "Avg Cyclomatic",
                unit: "count",
                min: 1,
                max: null,
                interpretation: "Average cyclomatic complexity per function",
              },
              value: 4.2,
            },
          ],
          files: [],
        },
      ],
    });

    const output = formatTerminalRich(report);
    expect(output).toContain("Size");
    expect(output).toContain("42");
    expect(output).toContain("Complexity");
    expect(output).toContain("4.2");
  });

  it("includes per-file details with file paths", () => {
    const report = makeReport({
      axes: [
        {
          axisId: "complexity",
          summary: [
            {
              descriptor: {
                id: "avg_cyclomatic",
                name: "Avg Cyclomatic",
                unit: "count",
                min: 1,
                max: null,
                interpretation: "Average cyclomatic complexity",
              },
              value: 5,
            },
          ],
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
                    interpretation: "Cyclomatic complexity of this file",
                  },
                  value: 12,
                },
              ],
            },
          ],
        },
      ],
    });

    const output = formatTerminalRich(report);
    // Rich format includes per-file paths (unlike compact)
    expect(output).toContain("/project/src/main.ts");
    expect(output).toContain("12");
  });

  it("includes multiple files in per-file breakdown", () => {
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
                interpretation: "Total lines",
              },
              value: 500,
            },
          ],
          files: [
            {
              filePath: "/project/src/a.ts",
              metrics: [
                {
                  descriptor: {
                    id: "lines",
                    name: "Lines",
                    unit: "lines",
                    min: 0,
                    max: null,
                    interpretation: "Lines in file",
                  },
                  value: 300,
                },
              ],
            },
            {
              filePath: "/project/src/b.ts",
              metrics: [
                {
                  descriptor: {
                    id: "lines",
                    name: "Lines",
                    unit: "lines",
                    min: 0,
                    max: null,
                    interpretation: "Lines in file",
                  },
                  value: 200,
                },
              ],
            },
          ],
        },
      ],
    });

    const output = formatTerminalRich(report);
    expect(output).toContain("/project/src/a.ts");
    expect(output).toContain("300");
    expect(output).toContain("/project/src/b.ts");
    expect(output).toContain("200");
  });

  it("displays a visual bar indicator for bounded metrics", () => {
    const report = makeReport({
      axes: [
        {
          axisId: "duplication",
          summary: [
            {
              descriptor: {
                id: "duplication_percent",
                name: "Duplication",
                unit: "percent",
                min: 0,
                max: 100,
                interpretation: "Percentage of duplicated code",
              },
              value: 50,
            },
          ],
          files: [],
        },
      ],
    });

    const output = formatTerminalRich(report);
    // Visual bar uses block characters for bounded metrics
    expect(output).toMatch(/[█▓░]/);
  });

  it("does not display a visual bar for unbounded metrics", () => {
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
              value: 1500,
            },
          ],
          files: [],
        },
      ],
    });

    const output = formatTerminalRich(report);
    // Unbounded metrics should not have bar indicators
    expect(output).not.toMatch(/[█▓░]/);
  });

  it("handles axes with no summary metrics", () => {
    const report = makeReport({
      axes: [
        {
          axisId: "dead-code",
          summary: [],
          files: [],
        },
      ],
    });

    const output = formatTerminalRich(report);
    expect(output).toContain("Dead Code");
    expect(output).toContain("No metrics");
  });

  it("displays multiple summary metrics within one axis", () => {
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
              value: 1500,
            },
            {
              descriptor: {
                id: "total_files",
                name: "Total Files",
                unit: "count",
                min: 0,
                max: null,
                interpretation: "Number of source files",
              },
              value: 25,
            },
          ],
          files: [],
        },
      ],
    });

    const output = formatTerminalRich(report);
    expect(output).toContain("1500");
    expect(output).toContain("25");
    expect(output).toContain("Total Lines");
    expect(output).toContain("Total Files");
  });

  it("includes axis description from the AXES registry", () => {
    const report = makeReport({
      axes: [
        {
          axisId: "complexity",
          summary: [
            {
              descriptor: {
                id: "avg_cyclomatic",
                name: "Avg Cyclomatic",
                unit: "count",
                min: 1,
                max: null,
                interpretation: "Average cyclomatic complexity",
              },
              value: 5,
            },
          ],
          files: [],
        },
      ],
    });

    const output = formatTerminalRich(report);
    expect(output).toContain("Cyclomatic/cognitive complexity per function and file");
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
          files: [
            {
              filePath: "/project/src/main.ts",
              metrics: [
                {
                  descriptor: {
                    id: "lines",
                    name: "Lines",
                    unit: "lines",
                    min: 0,
                    max: null,
                    interpretation: "Lines in file",
                  },
                  value: 100,
                },
              ],
            },
          ],
        },
      ],
    });

    const output1 = formatTerminalRich(report);
    const output2 = formatTerminalRich(report);
    expect(output1).toBe(output2);
  });

  it("displays warnings when axes could not be measured", () => {
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
      warnings: [
        { axisId: "security", message: 'No available adapter for axis "security"' },
        { axisId: "consistency", message: 'Adapter "eslint" failed: tool crashed' },
      ],
    });

    const output = formatTerminalRich(report);
    expect(output).toContain("Warnings");
    expect(output).toContain("Security");
    expect(output).toContain("Consistency");
  });

  it("does not display warnings section when there are no warnings", () => {
    const report = makeReport({
      warnings: [],
    });

    const output = formatTerminalRich(report);
    expect(output).not.toContain("Warnings");
  });

  it("color-codes values for bounded metrics", () => {
    const report = makeReport({
      axes: [
        {
          axisId: "duplication",
          summary: [
            {
              descriptor: {
                id: "duplication_percent",
                name: "Duplication",
                unit: "percent",
                min: 0,
                max: 100,
                interpretation: "Percentage of duplicated code",
              },
              value: 50,
            },
          ],
          files: [],
        },
      ],
    });

    const output = formatTerminalRich(report);
    // Bounded metrics should have ANSI color codes
    expect(output).toMatch(/\x1b\[\d+m/);
  });

  it("omits ANSI color codes when noColor is true", () => {
    const report = makeReport({
      axes: [
        {
          axisId: "duplication",
          summary: [
            {
              descriptor: {
                id: "duplication_percent",
                name: "Duplication",
                unit: "percent",
                min: 0,
                max: 100,
                interpretation: "Percentage of duplicated code",
              },
              value: 50,
            },
          ],
          files: [],
        },
      ],
    });

    const output = formatTerminalRich(report, { noColor: true });
    expect(output).not.toMatch(/\x1b\[\d+m/);
    expect(output).toContain("50");
  });

  it("does not color-code values for unbounded metrics", () => {
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
              value: 1500,
            },
          ],
          files: [],
        },
      ],
    });

    const output = formatTerminalRich(report);
    // Unbounded metric values should not have ANSI color codes in the value text
    // (note: bar characters are separate from value text)
    expect(output).not.toMatch(/\x1b\[\d+m.*1500/);
  });

  it("shows truncation notice when fileTotalCount exceeds displayed files", () => {
    const report = makeReport({
      axes: [
        {
          axisId: "size",
          summary: [],
          files: [
            {
              filePath: "/project/src/a.ts",
              metrics: [
                {
                  descriptor: {
                    id: "lines",
                    name: "Lines",
                    unit: "lines",
                    min: 0,
                    max: null,
                    interpretation: "Lines in file",
                  },
                  value: 100,
                },
              ],
            },
            {
              filePath: "/project/src/b.ts",
              metrics: [
                {
                  descriptor: {
                    id: "lines",
                    name: "Lines",
                    unit: "lines",
                    min: 0,
                    max: null,
                    interpretation: "Lines in file",
                  },
                  value: 200,
                },
              ],
            },
          ],
          fileTotalCount: 10,
        },
      ],
    });

    const output = formatTerminalRich(report);
    expect(output).toContain("2 of 10");
  });

  it("does not show truncation notice when fileTotalCount is absent", () => {
    const report = makeReport({
      axes: [
        {
          axisId: "size",
          summary: [],
          files: [
            {
              filePath: "/project/src/a.ts",
              metrics: [],
            },
          ],
        },
      ],
    });

    const output = formatTerminalRich(report);
    expect(output).not.toMatch(/\d+ of \d+/);
  });

  it("color-codes per-file metric values for bounded metrics", () => {
    const report = makeReport({
      axes: [
        {
          axisId: "test-coverage",
          summary: [
            {
              descriptor: {
                id: "line_coverage",
                name: "Line Coverage",
                unit: "percent",
                min: 0,
                max: 100,
                interpretation: "Line coverage percentage",
              },
              value: 80,
            },
          ],
          files: [
            {
              filePath: "/project/src/main.ts",
              metrics: [
                {
                  descriptor: {
                    id: "line_coverage",
                    name: "Line Coverage",
                    unit: "percent",
                    min: 0,
                    max: 100,
                    interpretation: "Line coverage for this file",
                  },
                  value: 65,
                },
              ],
            },
          ],
        },
      ],
    });

    const output = formatTerminalRich(report);
    // Both summary and file-level bounded values should be colored
    // Count ANSI reset sequences to confirm multiple colored values
    const resetCount = (output.match(/\x1b\[0m/g) || []).length;
    expect(resetCount).toBeGreaterThanOrEqual(2);
  });
});
