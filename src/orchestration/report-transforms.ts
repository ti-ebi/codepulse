/**
 * Pure transformations on MeasurementReport.
 *
 * These functions post-process a report (sorting, truncating file lists)
 * without mutating the original. They are used by both the CLI runner
 * and the MCP server handler.
 *
 * Dependencies: Types layer only.
 */

import type { MeasurementReport } from "../types/measurement.js";

/**
 * Returns a new report with each axis's files sorted descending by the given metric.
 * Files that lack the metric are sorted to the end in their original order.
 */
export function sortFiles(report: MeasurementReport, metricId: string): MeasurementReport {
  return {
    ...report,
    axes: report.axes.map((axis) => {
      const sorted = [...axis.files].sort((a, b) => {
        const aMetric = a.metrics.find((m) => m.descriptor.id === metricId);
        const bMetric = b.metrics.find((m) => m.descriptor.id === metricId);
        if (aMetric === undefined && bMetric === undefined) return 0;
        if (aMetric === undefined) return 1;
        if (bMetric === undefined) return -1;
        return bMetric.value - aMetric.value;
      });
      return { ...axis, files: sorted };
    }),
  };
}

/**
 * Returns a new report with each axis's files array truncated to at most `n` entries.
 * When truncation occurs, sets fileTotalCount so consumers know the full count.
 */
export function limitFiles(report: MeasurementReport, n: number): MeasurementReport {
  return {
    ...report,
    axes: report.axes.map((axis) => {
      if (axis.files.length <= n) {
        return axis;
      }
      return {
        ...axis,
        files: axis.files.slice(0, n),
        fileTotalCount: axis.files.length,
      };
    }),
  };
}
