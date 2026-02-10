/**
 * Tests for report-transforms module.
 *
 * Verifies that sortFiles and limitFiles correctly transform
 * MeasurementReport data without mutating the original.
 */

import { describe, it, expect } from "vitest";
import { sortFiles, limitFiles } from "./report-transforms.js";
import type { MeasurementReport, AxisMeasurement, MetricDescriptor } from "../types/measurement.js";

const codeLineDescriptor: MetricDescriptor = {
  id: "code-lines",
  name: "Code Lines",
  unit: "lines",
  min: 0,
  max: null,
  interpretation: "Lines of code in the file",
};

function makeReport(axes: AxisMeasurement[]): MeasurementReport {
  return {
    targetPath: "/project",
    timestamp: "2025-01-01T00:00:00.000Z",
    axes,
    warnings: [],
  };
}

describe("sortFiles", () => {
  it("sorts files descending by the specified metric", () => {
    const report = makeReport([
      {
        axisId: "size",
        summary: [],
        files: [
          { filePath: "/a.ts", metrics: [{ descriptor: codeLineDescriptor, value: 10 }] },
          { filePath: "/b.ts", metrics: [{ descriptor: codeLineDescriptor, value: 500 }] },
          { filePath: "/c.ts", metrics: [{ descriptor: codeLineDescriptor, value: 100 }] },
        ],
      },
    ]);

    const result = sortFiles(report, "code-lines");

    expect(result.axes[0]!.files[0]!.filePath).toBe("/b.ts");
    expect(result.axes[0]!.files[1]!.filePath).toBe("/c.ts");
    expect(result.axes[0]!.files[2]!.filePath).toBe("/a.ts");
  });

  it("pushes files without the metric to the end", () => {
    const report = makeReport([
      {
        axisId: "size",
        summary: [],
        files: [
          { filePath: "/no-metric.ts", metrics: [] },
          { filePath: "/has-metric.ts", metrics: [{ descriptor: codeLineDescriptor, value: 50 }] },
        ],
      },
    ]);

    const result = sortFiles(report, "code-lines");

    expect(result.axes[0]!.files[0]!.filePath).toBe("/has-metric.ts");
    expect(result.axes[0]!.files[1]!.filePath).toBe("/no-metric.ts");
  });

  it("preserves order when no files have the metric", () => {
    const report = makeReport([
      {
        axisId: "size",
        summary: [],
        files: [
          { filePath: "/c.ts", metrics: [] },
          { filePath: "/a.ts", metrics: [] },
          { filePath: "/b.ts", metrics: [] },
        ],
      },
    ]);

    const result = sortFiles(report, "nonexistent");

    expect(result.axes[0]!.files[0]!.filePath).toBe("/c.ts");
    expect(result.axes[0]!.files[1]!.filePath).toBe("/a.ts");
    expect(result.axes[0]!.files[2]!.filePath).toBe("/b.ts");
  });

  it("does not mutate the original report", () => {
    const report = makeReport([
      {
        axisId: "size",
        summary: [],
        files: [
          { filePath: "/a.ts", metrics: [{ descriptor: codeLineDescriptor, value: 10 }] },
          { filePath: "/b.ts", metrics: [{ descriptor: codeLineDescriptor, value: 500 }] },
        ],
      },
    ]);

    sortFiles(report, "code-lines");

    expect(report.axes[0]!.files[0]!.filePath).toBe("/a.ts");
  });
});

describe("limitFiles", () => {
  it("truncates file list to N entries", () => {
    const report = makeReport([
      {
        axisId: "size",
        summary: [],
        files: [
          { filePath: "/a.ts", metrics: [] },
          { filePath: "/b.ts", metrics: [] },
          { filePath: "/c.ts", metrics: [] },
          { filePath: "/d.ts", metrics: [] },
        ],
      },
    ]);

    const result = limitFiles(report, 2);

    expect(result.axes[0]!.files).toHaveLength(2);
    expect(result.axes[0]!.files[0]!.filePath).toBe("/a.ts");
    expect(result.axes[0]!.files[1]!.filePath).toBe("/b.ts");
  });

  it("sets fileTotalCount when truncation occurs", () => {
    const report = makeReport([
      {
        axisId: "size",
        summary: [],
        files: [
          { filePath: "/a.ts", metrics: [] },
          { filePath: "/b.ts", metrics: [] },
          { filePath: "/c.ts", metrics: [] },
        ],
      },
    ]);

    const result = limitFiles(report, 1);

    expect(result.axes[0]!.fileTotalCount).toBe(3);
  });

  it("does not set fileTotalCount when N exceeds file count", () => {
    const report = makeReport([
      {
        axisId: "size",
        summary: [],
        files: [
          { filePath: "/a.ts", metrics: [] },
        ],
      },
    ]);

    const result = limitFiles(report, 10);

    expect(result.axes[0]!.fileTotalCount).toBeUndefined();
    expect(result.axes[0]!.files).toHaveLength(1);
  });

  it("does not mutate the original report", () => {
    const report = makeReport([
      {
        axisId: "size",
        summary: [],
        files: [
          { filePath: "/a.ts", metrics: [] },
          { filePath: "/b.ts", metrics: [] },
          { filePath: "/c.ts", metrics: [] },
        ],
      },
    ]);

    limitFiles(report, 1);

    expect(report.axes[0]!.files).toHaveLength(3);
  });
});
