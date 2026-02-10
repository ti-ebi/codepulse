/**
 * Tool adapter interface.
 *
 * Every external tool (scc, jscpd, knip, etc.) is accessed through an
 * adapter that implements this interface. The adapter:
 *   1. Invokes the external tool's CLI
 *   2. Parses the tool's output
 *   3. Maps it to CodePulse's normalized schema
 */

import type { AxisId } from "../types/axis.js";
import type { AxisMeasurement } from "../types/measurement.js";
import type { Result } from "../types/result.js";

/**
 * Describes the availability status of an external tool.
 */
export type ToolAvailability =
  | { readonly available: true; readonly version: string }
  | { readonly available: false; readonly reason: string };

/**
 * Error returned when an adapter fails to produce a measurement.
 */
export interface AdapterError {
  readonly adapterId: string;
  readonly message: string;
  readonly cause?: unknown;
}

/**
 * The contract every tool adapter must fulfill.
 */
export interface ToolAdapter {
  /** Unique identifier for this adapter (e.g., "scc", "jscpd"). */
  readonly id: string;

  /** Human-readable name of the external tool. */
  readonly toolName: string;

  /** Which measurement axes this adapter can provide data for. */
  readonly supportedAxes: readonly AxisId[];

  /** Check whether the external tool is installed and usable. */
  checkAvailability(): Promise<ToolAvailability>;

  /**
   * Run the external tool against the target path and return
   * normalized measurements for the requested axis.
   */
  measure(
    targetPath: string,
    axisId: AxisId,
  ): Promise<Result<AxisMeasurement, AdapterError>>;
}
