/**
 * Orchestrator — coordinates adapter invocation and result aggregation.
 *
 * The orchestrator accepts a MeasurementConfig, resolves which adapters
 * handle each requested axis, invokes them, and assembles the results
 * into a MeasurementReport.
 *
 * Dependencies flow downward only: Orchestration → Adapter, Types.
 */

import type { AxisId } from "../types/axis.js";
import type { MeasurementConfig } from "../types/config.js";
import type { AxisMeasurement, AxisWarning, MeasurementReport } from "../types/measurement.js";
import type { Result } from "../types/result.js";
import type { AdapterError } from "../adapter/adapter.js";
import type { ToolAdapter } from "../adapter/adapter.js";
import type { AdapterRegistry } from "../adapter/registry.js";
import { AXES } from "../types/axis.js";
import { ok, err } from "../types/result.js";

/**
 * Error produced by the orchestrator when it cannot complete a measurement run.
 */
export interface OrchestrationError {
  readonly message: string;
  /** Per-axis errors, if any adapters failed during the run. */
  readonly axisErrors: readonly AxisOrchestrationError[];
}

/**
 * Records a failure for a single axis during orchestration.
 */
export interface AxisOrchestrationError {
  readonly axisId: AxisId;
  readonly adapterId: string;
  readonly error: AdapterError;
}

export interface MeasureOptions {
  /** When provided, generates the timestamp for the report. */
  readonly timestampFn?: () => string;
}

/**
 * Determines the set of axes to measure.
 *
 * If the config specifies axes, those are used. Otherwise all known
 * axes are returned (the caller will filter to those with adapters).
 */
function resolveRequestedAxes(config: MeasurementConfig): readonly AxisId[] {
  if (config.axes.length > 0) {
    return config.axes;
  }
  return [...AXES.keys()];
}

/**
 * For each requested axis, pick the first available adapter.
 * Returns a map from axis to adapter, plus a list of axes
 * that have no adapter registered.
 */
async function resolveAdapters(
  registry: AdapterRegistry,
  axes: readonly AxisId[],
): Promise<{
  resolved: Map<AxisId, ToolAdapter>;
  unavailable: AxisId[];
}> {
  const resolved = new Map<AxisId, ToolAdapter>();
  const unavailable: AxisId[] = [];

  for (const axisId of axes) {
    const adapters = registry.getAdaptersForAxis(axisId);
    let found = false;

    for (const adapter of adapters) {
      const availability = await adapter.checkAvailability();
      if (availability.available) {
        resolved.set(axisId, adapter);
        found = true;
        break;
      }
    }

    if (!found) {
      unavailable.push(axisId);
    }
  }

  return { resolved, unavailable };
}

/**
 * Run a full measurement pass according to the given config.
 *
 * Behavior:
 * - Resolves which axes to measure and finds adapters for each.
 * - Axes with no available adapter produce a warning in the report
 *   (partial results are preferred over total failure).
 * - If *all* requested axes fail (no adapters or all adapters error),
 *   returns an OrchestrationError.
 * - Individual adapter errors are collected but do not abort the run.
 */
export async function measure(
  config: MeasurementConfig,
  registry: AdapterRegistry,
  options?: MeasureOptions,
): Promise<Result<MeasurementReport, OrchestrationError>> {
  const requestedAxes = resolveRequestedAxes(config);
  const { resolved, unavailable } = await resolveAdapters(registry, requestedAxes);

  // If no axes could be resolved, fail early.
  if (resolved.size === 0) {
    return err({
      message:
        unavailable.length > 0
          ? `No available adapters for requested axes: ${unavailable.join(", ")}`
          : "No axes requested and no adapters registered",
      axisErrors: [],
    });
  }

  const entries = [...resolved.entries()];
  const results = await Promise.all(
    entries.map(([axisId, adapter]) => adapter.measure(config.targetPath, axisId)),
  );

  const axisMeasurements: AxisMeasurement[] = [];
  const axisErrors: AxisOrchestrationError[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const [axisId, adapter] = entries[i]!;
    if (result.ok) {
      axisMeasurements.push(result.value);
    } else {
      axisErrors.push({
        axisId,
        adapterId: adapter.id,
        error: result.error,
      });
    }
  }

  // If every resolved adapter errored, return failure.
  if (axisMeasurements.length === 0 && axisErrors.length > 0) {
    return err({
      message: "All adapters failed during measurement",
      axisErrors,
    });
  }

  const warnings: AxisWarning[] = [];
  for (const axisId of unavailable) {
    warnings.push({ axisId, message: `No available adapter for axis "${axisId}"` });
  }
  for (const axisError of axisErrors) {
    warnings.push({
      axisId: axisError.axisId,
      message: `Adapter "${axisError.adapterId}" failed: ${axisError.error.message}`,
    });
  }

  const timestampFn = options?.timestampFn ?? (() => new Date().toISOString());

  const report: MeasurementReport = {
    targetPath: config.targetPath,
    timestamp: timestampFn(),
    axes: axisMeasurements,
    warnings,
  };

  return ok(report);
}
