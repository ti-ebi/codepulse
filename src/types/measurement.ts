/**
 * Measurement result types.
 *
 * Every measurement axis produces results conforming to these types.
 * Metric metadata (unit, range, interpretation) is included to support
 * AI agent consumption without parsing heuristics.
 */

import type { AxisId } from "./axis.js";

/**
 * Describes a single metric's metadata so consumers (AI agents, CI)
 * can interpret numeric values without external documentation.
 */
export interface MetricDescriptor {
  /** Machine-readable identifier, unique within an axis. */
  readonly id: string;
  /** Human-readable name for display. */
  readonly name: string;
  /** Unit of measurement (e.g., "lines", "percent", "count"). */
  readonly unit: string;
  /** Inclusive lower bound of possible values. */
  readonly min: number;
  /** Inclusive upper bound of possible values, or null if unbounded. */
  readonly max: number | null;
  /** Guidance for interpretation, phrased neutrally (no good/bad). */
  readonly interpretation: string;
}

/**
 * A single measured value paired with its descriptor.
 */
export interface MetricValue {
  readonly descriptor: MetricDescriptor;
  readonly value: number;
}

/**
 * A file-level measurement: metrics scoped to a single source file.
 */
export interface FileMeasurement {
  /** Absolute path to the measured file. */
  readonly filePath: string;
  /** Metrics measured for this file. */
  readonly metrics: readonly MetricValue[];
}

/**
 * The complete result of measuring one axis on a target codebase.
 */
export interface AxisMeasurement {
  /** Which axis produced this measurement. */
  readonly axisId: AxisId;
  /** Summary-level metrics aggregated across all files. */
  readonly summary: readonly MetricValue[];
  /** Per-file breakdown, if the axis supports it. */
  readonly files: readonly FileMeasurement[];
}

/**
 * A warning about an axis that was requested but could not be measured.
 * Included in the report so consumers know which axes are missing and why.
 */
export interface AxisWarning {
  /** Which axis was requested. */
  readonly axisId: AxisId;
  /** Human-readable reason the axis could not be measured. */
  readonly message: string;
}

/**
 * The top-level measurement report containing results from all requested axes.
 */
export interface MeasurementReport {
  /** Absolute path to the target directory that was measured. */
  readonly targetPath: string;
  /** ISO 8601 timestamp of when the measurement was taken. */
  readonly timestamp: string;
  /** Results from each requested axis. */
  readonly axes: readonly AxisMeasurement[];
  /** Axes that were requested but could not be measured. */
  readonly warnings: readonly AxisWarning[];
}
