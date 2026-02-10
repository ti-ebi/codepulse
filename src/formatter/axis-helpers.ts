/**
 * Shared helpers for resolving axis metadata from the AXES registry.
 *
 * Used by all formatters to map an AxisMeasurement to its human-readable
 * name and description. Depends only on the Types layer.
 */

import type { AxisId } from "../types/axis.js";
import type { AxisMeasurement, MetricValue } from "../types/measurement.js";
import { AXES } from "../types/axis.js";

/**
 * Returns the human-readable axis name for a given AxisId,
 * falling back to the raw id if not found in the registry.
 */
export function axisNameById(axisId: AxisId): string {
  const descriptor = AXES.get(axisId);
  return descriptor !== undefined ? descriptor.name : axisId;
}

/**
 * Returns the human-readable axis name from the AXES registry,
 * falling back to the raw axisId if not found.
 */
export function axisName(axis: AxisMeasurement): string {
  return axisNameById(axis.axisId);
}

/**
 * Returns the axis description from the AXES registry,
 * or an empty string if not found.
 */
export function axisDescription(axis: AxisMeasurement): string {
  const descriptor = AXES.get(axis.axisId);
  return descriptor !== undefined ? descriptor.description : "";
}

/**
 * ANSI escape codes for magnitude-based color coding.
 * Colors visualize scale position, not judgment (CLAUDE.md boundary).
 */
const ANSI_RESET = "\x1b[0m";
const ANSI_CYAN = "\x1b[36m";
const ANSI_YELLOW = "\x1b[33m";
const ANSI_MAGENTA = "\x1b[35m";

/**
 * Wraps a formatted metric value string with ANSI color codes based on
 * where the metric's value falls within its [min, max] range.
 *
 * - Lower third of range: cyan
 * - Middle third of range: yellow
 * - Upper third of range: magenta
 *
 * Returns the plain string unchanged for unbounded metrics (max is null)
 * or zero-range metrics (min equals max).
 */
export function colorizeValue(formatted: string, metric: MetricValue, noColor = false): string {
  if (noColor) {
    return formatted;
  }
  const { min, max } = metric.descriptor;
  if (max === null) {
    return formatted;
  }
  const range = max - min;
  if (range <= 0) {
    return formatted;
  }
  const clamped = Math.max(min, Math.min(max, metric.value));
  const ratio = (clamped - min) / range;

  let color: string;
  if (ratio < 1 / 3) {
    color = ANSI_CYAN;
  } else if (ratio < 2 / 3) {
    color = ANSI_YELLOW;
  } else {
    color = ANSI_MAGENTA;
  }

  return `${color}${formatted}${ANSI_RESET}`;
}
