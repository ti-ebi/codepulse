/**
 * Terminal-rich formatter — renders a MeasurementReport as a detailed
 * breakdown with visual indicators, including per-file metrics.
 *
 * Contrasts with terminal-compact which shows only summary-level data.
 * Depends only on the Types layer.
 */

import type { MeasurementReport, MetricValue } from "../types/measurement.js";
import type { FormatterOptions } from "./formatter.js";
import { axisName, axisNameById, axisDescription, colorizeValue } from "./axis-helpers.js";

const BAR_WIDTH = 20;

/**
 * Renders a visual bar for a bounded metric (where max is not null).
 * Uses block characters to visualize the proportion of value within [min, max].
 */
function renderBar(value: number, min: number, max: number): string {
  const range = max - min;
  if (range <= 0) {
    return "";
  }
  const clamped = Math.max(min, Math.min(max, value));
  const ratio = (clamped - min) / range;
  const filled = Math.round(ratio * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

/**
 * Formats a single metric value with its unit for display.
 */
function formatMetricValue(value: number, unit: string): string {
  return `${value} ${unit}`;
}

/**
 * Formats a single metric line, optionally with a visual bar for bounded metrics.
 * Bounded metrics are color-coded to indicate their position within the range.
 */
function formatMetricLine(metric: MetricValue, indent: string, noColor = false): string {
  const formatted = formatMetricValue(metric.value, metric.descriptor.unit);
  const colorized = colorizeValue(formatted, metric, noColor);
  if (metric.descriptor.max !== null) {
    const bar = renderBar(metric.value, metric.descriptor.min, metric.descriptor.max);
    return `${indent}${metric.descriptor.name}: ${colorized}  ${bar}`;
  }
  return `${indent}${metric.descriptor.name}: ${colorized}`;
}

/**
 * Formats a MeasurementReport as a detailed terminal output with
 * visual indicators and per-file breakdowns.
 *
 * Output is deterministic for identical input (Principle #3).
 */
export function formatTerminalRich(report: MeasurementReport, options?: FormatterOptions): string {
  const noColor = options?.noColor ?? false;
  const lines: string[] = [];

  lines.push(`CodePulse Report: ${report.targetPath}`);
  lines.push(`Measured at: ${report.timestamp}`);
  lines.push("");

  if (report.axes.length === 0) {
    lines.push("No axes measured.");
    return lines.join("\n");
  }

  for (let axisIdx = 0; axisIdx < report.axes.length; axisIdx++) {
    const axis = report.axes[axisIdx]!;
    const name = axisName(axis);
    const description = axisDescription(axis);

    // Axis header with separator
    lines.push("─".repeat(60));
    lines.push(name);
    if (description.length > 0) {
      lines.push(`  ${description}`);
    }
    lines.push("");

    // Summary metrics
    if (axis.summary.length === 0) {
      lines.push("  No metrics available.");
    } else {
      for (const metric of axis.summary) {
        lines.push(formatMetricLine(metric, "  ", noColor));
      }
    }

    // Per-file breakdown
    if (axis.files.length > 0) {
      lines.push("");
      lines.push("  Files:");
      for (const file of axis.files) {
        lines.push(`    ${file.filePath}`);
        for (const metric of file.metrics) {
          lines.push(formatMetricLine(metric, "      ", noColor));
        }
      }
    }

    // Add blank line between axes (but not after the last one)
    if (axisIdx < report.axes.length - 1) {
      lines.push("");
    }
  }

  if (report.warnings.length > 0) {
    lines.push("");
    lines.push("─".repeat(60));
    lines.push("Warnings");
    lines.push("");
    for (const warning of report.warnings) {
      lines.push(`  ${axisNameById(warning.axisId)}: ${warning.message}`);
    }
  }

  return lines.join("\n");
}
