/**
 * JSON formatter — serializes a MeasurementReport to a JSON string.
 *
 * The output includes full metric metadata (unit, range, interpretation)
 * to support AI agent consumption without parsing heuristics (Principle #7).
 *
 * Depends only on the Types layer.
 */

import type { MeasurementReport } from "../types/measurement.js";

/**
 * Formats a MeasurementReport as a pretty-printed JSON string.
 *
 * The output is deterministic for identical input (Principle #3):
 * JSON.stringify with consistent key ordering from the readonly
 * interfaces guarantees this.
 */
export function formatJson(report: MeasurementReport): string {
  return JSON.stringify(report, null, 2);
}
