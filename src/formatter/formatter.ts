/**
 * Formatter interface for transforming MeasurementReports into output strings.
 *
 * Each output format (JSON, terminal-compact, terminal-rich, HTML) is
 * implemented as a function conforming to this type. Formatters depend
 * only on the Types layer.
 */

import type { MeasurementReport } from "../types/measurement.js";

/**
 * Options that control formatter output behavior.
 */
export interface FormatterOptions {
  /** Disable ANSI color codes in terminal output. */
  readonly noColor?: boolean;
}

/**
 * A Formatter takes a MeasurementReport and produces a formatted string
 * suitable for output to stdout or a file.
 */
export type Formatter = (report: MeasurementReport, options?: FormatterOptions) => string;
