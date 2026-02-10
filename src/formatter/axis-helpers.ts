/**
 * Shared helpers for resolving axis metadata from the AXES registry.
 *
 * Used by all formatters to map an AxisMeasurement to its human-readable
 * name and description. Depends only on the Types layer.
 */

import type { AxisId } from "../types/axis.js";
import type { AxisMeasurement } from "../types/measurement.js";
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
