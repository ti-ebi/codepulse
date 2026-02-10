/**
 * Tests for the HTML formatter.
 *
 * The HTML formatter produces a self-contained static HTML file that renders
 * as a dashboard in any browser (no server required). It depends only on
 * the Types layer.
 */

import { describe, it, expect } from "vitest";
import type { MeasurementReport } from "../types/measurement.js";
import type { Formatter } from "./formatter.js";
import { formatHtml } from "./html.js";

function makeReport(overrides?: Partial<MeasurementReport>): MeasurementReport {
  return {
    targetPath: "/project",
    timestamp: "2025-01-15T10:00:00.000Z",
    axes: [],
    ...overrides,
  };
}

describe("formatHtml", () => {
  it("satisfies the Formatter type", () => {
    const formatter: Formatter = formatHtml;
    expect(typeof formatter).toBe("function");
  });

  it("returns a complete HTML document", () => {
    const report = makeReport();
    const output = formatHtml(report);
    expect(output).toContain("<!DOCTYPE html>");
    expect(output).toContain("<html");
    expect(output).toContain("</html>");
    expect(output).toContain("<head>");
    expect(output).toContain("</head>");
    expect(output).toContain("<body>");
    expect(output).toContain("</body>");
  });

  it("is self-contained with inline CSS", () => {
    const report = makeReport();
    const output = formatHtml(report);
    expect(output).toContain("<style>");
    // Must not reference external stylesheets or scripts
    expect(output).not.toMatch(/<link[^>]+rel=["']stylesheet["']/);
    expect(output).not.toMatch(/<script[^>]+src=/);
  });

  it("includes the target path in the report header", () => {
    const report = makeReport({ targetPath: "/my/project" });
    const output = formatHtml(report);
    expect(output).toContain("/my/project");
  });

  it("includes the timestamp in the report header", () => {
    const report = makeReport({ timestamp: "2025-06-01T12:00:00.000Z" });
    const output = formatHtml(report);
    expect(output).toContain("2025-06-01T12:00:00.000Z");
  });

  it("includes the page title", () => {
    const report = makeReport();
    const output = formatHtml(report);
    expect(output).toContain("<title>CodePulse Report</title>");
  });

  it("shows a message when no axes are measured", () => {
    const report = makeReport({ axes: [] });
    const output = formatHtml(report);
    expect(output).toContain("No axes measured.");
  });

  it("renders axis names from the AXES registry", () => {
    const report = makeReport({
      axes: [
        {
          axisId: "size",
          summary: [
            {
              descriptor: {
                id: "total-lines",
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
    const output = formatHtml(report);
    expect(output).toContain("Size");
  });

  it("renders summary metrics with names, values, and units", () => {
    const report = makeReport({
      axes: [
        {
          axisId: "size",
          summary: [
            {
              descriptor: {
                id: "total-lines",
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
                id: "file-count",
                name: "File Count",
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
      ],
    });
    const output = formatHtml(report);
    expect(output).toContain("Total Lines");
    expect(output).toContain("1500");
    expect(output).toContain("lines");
    expect(output).toContain("File Count");
    expect(output).toContain("42");
  });

  it("renders a visual bar for bounded metrics", () => {
    const report = makeReport({
      axes: [
        {
          axisId: "duplication",
          summary: [
            {
              descriptor: {
                id: "duplication-percentage",
                name: "Duplication Percentage",
                unit: "percent",
                min: 0,
                max: 100,
                interpretation: "Percentage of duplicated code",
              },
              value: 25,
            },
          ],
          files: [],
        },
      ],
    });
    const output = formatHtml(report);
    // Should contain a bar element with a width style reflecting the percentage
    expect(output).toMatch(/width:\s*25%/);
  });

  it("does not render a bar for unbounded metrics", () => {
    const report = makeReport({
      axes: [
        {
          axisId: "size",
          summary: [
            {
              descriptor: {
                id: "total-lines",
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
    const output = formatHtml(report);
    // Should not contain percentage-based bar widths for unbounded metrics
    expect(output).not.toMatch(/class="bar-fill"/);
  });

  it("renders per-file breakdown when files are present", () => {
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
                    interpretation: "Linearly independent paths",
                  },
                  value: 12,
                },
              ],
            },
            {
              filePath: "/project/src/utils.ts",
              metrics: [
                {
                  descriptor: {
                    id: "cyclomatic",
                    name: "Cyclomatic Complexity",
                    unit: "count",
                    min: 1,
                    max: null,
                    interpretation: "Linearly independent paths",
                  },
                  value: 3,
                },
              ],
            },
          ],
        },
      ],
    });
    const output = formatHtml(report);
    expect(output).toContain("/project/src/main.ts");
    expect(output).toContain("/project/src/utils.ts");
    expect(output).toContain("Cyclomatic Complexity");
  });

  it("does not render file section when no files are present", () => {
    const report = makeReport({
      axes: [
        {
          axisId: "size",
          summary: [
            {
              descriptor: {
                id: "total-lines",
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
    const output = formatHtml(report);
    expect(output).not.toContain("Files");
  });

  it("renders multiple axes", () => {
    const report = makeReport({
      axes: [
        {
          axisId: "size",
          summary: [
            {
              descriptor: {
                id: "total-lines",
                name: "Total Lines",
                unit: "lines",
                min: 0,
                max: null,
                interpretation: "Total lines",
              },
              value: 500,
            },
          ],
          files: [],
        },
        {
          axisId: "duplication",
          summary: [
            {
              descriptor: {
                id: "duplication-percentage",
                name: "Duplication Percentage",
                unit: "percent",
                min: 0,
                max: 100,
                interpretation: "Duplicated code percentage",
              },
              value: 10,
            },
          ],
          files: [],
        },
      ],
    });
    const output = formatHtml(report);
    expect(output).toContain("Size");
    expect(output).toContain("Duplication");
  });

  it("produces deterministic output for identical input", () => {
    const report = makeReport({
      axes: [
        {
          axisId: "size",
          summary: [
            {
              descriptor: {
                id: "total-lines",
                name: "Total Lines",
                unit: "lines",
                min: 0,
                max: null,
                interpretation: "Total lines",
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
                    id: "file-lines",
                    name: "Lines",
                    unit: "lines",
                    min: 0,
                    max: null,
                    interpretation: "Lines in this file",
                  },
                  value: 100,
                },
              ],
            },
          ],
        },
      ],
    });
    const output1 = formatHtml(report);
    const output2 = formatHtml(report);
    expect(output1).toBe(output2);
  });

  it("escapes HTML special characters in target path", () => {
    const report = makeReport({ targetPath: "/project/<script>alert(1)</script>" });
    const output = formatHtml(report);
    expect(output).not.toContain("<script>alert(1)</script>");
    expect(output).toContain("&lt;script&gt;");
  });

  it("escapes HTML special characters in file paths", () => {
    const report = makeReport({
      axes: [
        {
          axisId: "size",
          summary: [],
          files: [
            {
              filePath: "/project/<b>file</b>.ts",
              metrics: [],
            },
          ],
        },
      ],
    });
    const output = formatHtml(report);
    expect(output).not.toContain("<b>file</b>");
    expect(output).toContain("&lt;b&gt;file&lt;/b&gt;");
  });

  it("renders axis description when available", () => {
    const report = makeReport({
      axes: [
        {
          axisId: "size",
          summary: [],
          files: [],
        },
      ],
    });
    const output = formatHtml(report);
    // "size" axis has description "Lines of code, file count, function length distribution"
    expect(output).toContain("Lines of code, file count, function length distribution");
  });

  it("clamps bar width for values exceeding max", () => {
    const report = makeReport({
      axes: [
        {
          axisId: "duplication",
          summary: [
            {
              descriptor: {
                id: "duplication-percentage",
                name: "Duplication Percentage",
                unit: "percent",
                min: 0,
                max: 100,
                interpretation: "Duplicated code percentage",
              },
              value: 150,
            },
          ],
          files: [],
        },
      ],
    });
    const output = formatHtml(report);
    expect(output).toMatch(/width:\s*100%/);
  });

  it("handles metric with zero range gracefully", () => {
    const report = makeReport({
      axes: [
        {
          axisId: "size",
          summary: [
            {
              descriptor: {
                id: "fixed",
                name: "Fixed Metric",
                unit: "count",
                min: 5,
                max: 5,
                interpretation: "A metric with zero range",
              },
              value: 5,
            },
          ],
          files: [],
        },
      ],
    });
    // Should not throw and should not produce a bar
    const output = formatHtml(report);
    expect(output).toContain("Fixed Metric");
    expect(output).toContain("5");
  });
});
