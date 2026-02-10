/**
 * JSON formatter — serializes a MeasurementReport to a JSON string.
 *
 * The output includes full metric metadata (unit, range, interpretation)
 * and axis metadata (name, description) to support AI agent consumption
 * without parsing heuristics (Principle #7).
 *
 * Depends only on the Types layer.
 */

import type { MeasurementReport } from "../types/measurement.js";
import { axisName, axisNameById, axisDescription } from "./axis-helpers.js";

/**
 * Formats a MeasurementReport as a pretty-printed JSON string.
 *
 * Each axis entry is enriched with human-readable `axisName` and
 * `axisDescription` fields resolved from the AXES registry, so that
 * consumers can interpret the report without external documentation.
 *
 * The output is deterministic for identical input (Principle #3):
 * JSON.stringify with consistent key ordering guarantees this.
 */
export function formatJson(report: MeasurementReport): string {
  const enriched = {
    targetPath: report.targetPath,
    timestamp: report.timestamp,
    axes: report.axes.map((axis) => ({
      axisId: axis.axisId,
      axisName: axisName(axis),
      axisDescription: axisDescription(axis),
      summary: axis.summary,
      files: axis.files,
    })),
    warnings: report.warnings.map((w) => ({
      axisId: w.axisId,
      axisName: axisNameById(w.axisId),
      message: w.message,
    })),
  };
  return JSON.stringify(enriched, null, 2);
}
