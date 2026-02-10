/**
 * Shared helpers for resolving axis metadata from the AXES registry.
 *
 * Used by all formatters to map an AxisMeasurement to its human-readable
 * name and description. Depends only on the Types layer.
 */

import type { AxisMeasurement } from "../types/measurement.js";
import { AXES } from "../types/axis.js";

/**
 * Returns the human-readable axis name from the AXES registry,
 * falling back to the raw axisId if not found.
 */
export function axisName(axis: AxisMeasurement): string {
  const descriptor = AXES.get(axis.axisId);
  return descriptor !== undefined ? descriptor.name : axis.axisId;
}

/**
 * Returns the axis description from the AXES registry,
 * or an empty string if not found.
 */
export function axisDescription(axis: AxisMeasurement): string {
  const descriptor = AXES.get(axis.axisId);
  return descriptor !== undefined ? descriptor.description : "";
}
