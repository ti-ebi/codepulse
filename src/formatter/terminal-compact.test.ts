/**
 * Tests for the terminal-compact formatter.
 *
 * The terminal-compact formatter produces a single summary table
 * suitable for quick review in CI/CD pipelines and terminal output.
 */

import { describe, it, expect } from "vitest";
import type { MeasurementReport } from "../types/measurement.js";
import type { Formatter } from "./formatter.js";
import { formatTerminalCompact } from "./terminal-compact.js";

function makeReport(overrides?: Partial<MeasurementReport>): MeasurementReport {
  return {
    targetPath: "/project",
    timestamp: "2025-01-15T10:00:00.000Z",
    axes: [],
    warnings: [],
    ...overrides,
  };
}

describe("formatTerminalCompact", () => {
  it("satisfies the Formatter type", () => {
    const formatter: Formatter = formatTerminalCompact;
    expect(typeof formatter).toBe("function");
  });

  it("returns a string for an empty report", () => {
    const report = makeReport();
    const output = formatTerminalCompact(report);
    expect(typeof output).toBe("string");
    expect(output.length).toBeGreaterThan(0);
  });

  it("includes the target path in output", () => {
    const report = makeReport({ targetPath: "/my/project" });
    const output = formatTerminalCompact(report);
    expect(output).toContain("/my/project");
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

    const output = formatTerminalCompact(report);
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

    const output = formatTerminalCompact(report);
    expect(output).toContain("8.5");
    expect(output).toContain("percent");
  });

  it("displays multiple axes", () => {
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

    const output = formatTerminalCompact(report);
    expect(output).toContain("Size");
    expect(output).toContain("42");
    expect(output).toContain("Complexity");
    expect(output).toContain("4.2");
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

    const output = formatTerminalCompact(report);
    expect(output).toContain("1500");
    expect(output).toContain("25");
    expect(output).toContain("Total Lines");
    expect(output).toContain("Total Files");
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

    const output = formatTerminalCompact(report);
    expect(output).toContain("Dead Code");
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

    const output1 = formatTerminalCompact(report);
    const output2 = formatTerminalCompact(report);
    expect(output1).toBe(output2);
  });

  it("does not include raw file-level details in compact output", () => {
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

    const output = formatTerminalCompact(report);
    // Compact format shows summary only, not per-file paths
    expect(output).not.toContain("/project/src/main.ts");
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
      ],
    });

    const output = formatTerminalCompact(report);
    expect(output).toContain("Warnings");
    expect(output).toContain("Security");
  });

  it("does not display warnings section when there are no warnings", () => {
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
      warnings: [],
    });

    const output = formatTerminalCompact(report);
    expect(output).not.toContain("Warnings");
  });
});
