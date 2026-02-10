/**
 * Configuration schema for CodePulse.
 */

import type { AxisId } from "./axis.js";

/**
 * Supported output formats.
 */
export type OutputFormat =
  | "terminal-compact"
  | "terminal-rich"
  | "json"
  | "html";

/**
 * User-configurable thresholds for a single metric.
 * Thresholds are starting values, not recommendations.
 */
export interface MetricThreshold {
  readonly metricId: string;
  readonly low: number;
  readonly high: number;
}

/**
 * Configuration for a single measurement run.
 */
export interface MeasurementConfig {
  /** Absolute path to the target directory to measure. */
  readonly targetPath: string;
  /** Which axes to measure. If empty, all available axes are measured. */
  readonly axes: readonly AxisId[];
  /** Desired output format. */
  readonly outputFormat: OutputFormat;
  /** Optional output file path. If omitted, output goes to stdout. */
  readonly outputPath?: string | undefined;
  /** User-configured thresholds for color coding. */
  readonly thresholds: readonly MetricThreshold[];
  /** Disable ANSI color codes in terminal output. */
  readonly noColor: boolean;
  /** Limit per-axis file-level results to the top N entries. Undefined means no limit. */
  readonly topN?: number | undefined;
}
