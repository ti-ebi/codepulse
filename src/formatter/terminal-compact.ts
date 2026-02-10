/**
 * Terminal-compact formatter — renders a MeasurementReport as a
 * concise summary table for quick review in terminals and CI/CD pipelines.
 *
 * Shows only summary-level metrics per axis (no per-file breakdown).
 * Depends only on the Types layer.
 */

import type { MeasurementReport } from "../types/measurement.js";
import { axisName } from "./axis-helpers.js";

/**
 * Formats a single metric value with its unit for display.
 */
function formatMetricValue(value: number, unit: string): string {
  return `${value} ${unit}`;
}

/**
 * Formats a MeasurementReport as a compact terminal summary table.
 *
 * Output is deterministic for identical input (Principle #3).
 * Only summary-level metrics are shown; per-file details are omitted
 * to keep the output compact.
 */
export function formatTerminalCompact(report: MeasurementReport): string {
  const lines: string[] = [];

  lines.push(`CodePulse Report: ${report.targetPath}`);
  lines.push(`Measured at: ${report.timestamp}`);
  lines.push("");

  if (report.axes.length === 0) {
    lines.push("No axes measured.");
    return lines.join("\n");
  }

  // Calculate column widths for alignment
  const rows: Array<{ axis: string; metric: string; value: string }> = [];

  for (const axis of report.axes) {
    const name = axisName(axis);

    if (axis.summary.length === 0) {
      rows.push({ axis: name, metric: "-", value: "-" });
      continue;
    }

    for (let i = 0; i < axis.summary.length; i++) {
      const metricValue = axis.summary[i]!;
      rows.push({
        axis: i === 0 ? name : "",
        metric: metricValue.descriptor.name,
        value: formatMetricValue(metricValue.value, metricValue.descriptor.unit),
      });
    }
  }

  const axisWidth = Math.max(...rows.map((r) => r.axis.length), 4);
  const metricWidth = Math.max(...rows.map((r) => r.metric.length), 6);
  const valueWidth = Math.max(...rows.map((r) => r.value.length), 5);

  // Header
  const header = [
    "Axis".padEnd(axisWidth),
    "Metric".padEnd(metricWidth),
    "Value".padEnd(valueWidth),
  ].join("  ");
  lines.push(header);

  // Separator
  lines.push([
    "-".repeat(axisWidth),
    "-".repeat(metricWidth),
    "-".repeat(valueWidth),
  ].join("  "));

  // Data rows
  for (const row of rows) {
    lines.push([
      row.axis.padEnd(axisWidth),
      row.metric.padEnd(metricWidth),
      row.value.padEnd(valueWidth),
    ].join("  "));
  }

  if (report.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const warning of report.warnings) {
      lines.push(`  ${warning.axisId}: ${warning.message}`);
    }
  }

  return lines.join("\n");
}
