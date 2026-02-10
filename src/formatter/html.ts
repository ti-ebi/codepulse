/**
 * HTML formatter — renders a MeasurementReport as a self-contained static
 * HTML file that opens as a dashboard in any browser (no server required).
 *
 * The output is a single HTML file with all CSS inlined. No external
 * stylesheets, scripts, or assets are referenced.
 *
 * Depends only on the Types layer.
 */

import type { AxisMeasurement, MeasurementReport, MetricValue } from "../types/measurement.js";
import { axisName, axisNameById, axisDescription } from "./axis-helpers.js";

/**
 * Escapes HTML special characters to prevent XSS in rendered output.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Calculates the bar width percentage for a bounded metric.
 * Returns null for unbounded metrics or zero-range metrics.
 */
function barWidthPercent(metric: MetricValue): number | null {
  const { min, max } = metric.descriptor;
  if (max === null) {
    return null;
  }
  const range = max - min;
  if (range <= 0) {
    return null;
  }
  const clamped = Math.max(min, Math.min(max, metric.value));
  const ratio = (clamped - min) / range;
  return Math.round(ratio * 100);
}

/**
 * Renders a single metric row as an HTML table row.
 */
function renderMetricRow(metric: MetricValue): string {
  const name = escapeHtml(metric.descriptor.name);
  const unit = escapeHtml(metric.descriptor.unit);
  const width = barWidthPercent(metric);

  const barCell = width !== null
    ? `<td class="bar-cell"><div class="bar-track"><div class="bar-fill" style="width: ${width}%"></div></div></td>`
    : `<td class="bar-cell"></td>`;

  return `<tr><td class="metric-name">${name}</td><td class="metric-value">${metric.value} ${unit}</td>${barCell}</tr>`;
}

/**
 * Renders a single axis section.
 */
function renderAxis(axis: AxisMeasurement): string {
  const name = escapeHtml(axisName(axis));
  const description = axisDescription(axis);
  const lines: string[] = [];

  lines.push(`<section class="axis">`);
  lines.push(`<h2>${name}</h2>`);
  if (description.length > 0) {
    lines.push(`<p class="axis-description">${escapeHtml(description)}</p>`);
  }

  if (axis.summary.length > 0) {
    lines.push(`<table class="metrics-table">`);
    lines.push(`<thead><tr><th>Metric</th><th>Value</th><th></th></tr></thead>`);
    lines.push(`<tbody>`);
    for (const metric of axis.summary) {
      lines.push(renderMetricRow(metric));
    }
    lines.push(`</tbody></table>`);
  }

  if (axis.files.length > 0) {
    const fileCount = axis.files.length;
    const fileLabel = fileCount === 1 ? "1 file" : `${fileCount} files`;
    lines.push(`<details class="files-section">`);
    lines.push(`<summary class="files-toggle">${fileLabel}</summary>`);
    for (const file of axis.files) {
      lines.push(`<div class="file-entry">`);
      lines.push(`<div class="file-path">${escapeHtml(file.filePath)}</div>`);
      if (file.metrics.length > 0) {
        lines.push(`<table class="metrics-table file-metrics">`);
        lines.push(`<thead><tr><th>Metric</th><th>Value</th><th></th></tr></thead>`);
        lines.push(`<tbody>`);
        for (const metric of file.metrics) {
          lines.push(renderMetricRow(metric));
        }
        lines.push(`</tbody></table>`);
      }
      lines.push(`</div>`);
    }
    lines.push(`</details>`);
  }

  lines.push(`</section>`);
  return lines.join("\n");
}

const CSS = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      padding: 2rem;
      line-height: 1.5;
    }
    .header {
      border-bottom: 1px solid #30363d;
      padding-bottom: 1rem;
      margin-bottom: 2rem;
    }
    .header h1 {
      color: #f0f6fc;
      font-size: 1.5rem;
      margin-bottom: 0.25rem;
    }
    .header .meta {
      color: #8b949e;
      font-size: 0.875rem;
    }
    .axis {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 1.25rem;
      margin-bottom: 1rem;
    }
    .axis h2 {
      color: #f0f6fc;
      font-size: 1.125rem;
      margin-bottom: 0.25rem;
    }
    .axis-description {
      color: #8b949e;
      font-size: 0.875rem;
      margin-bottom: 0.75rem;
    }
    .metrics-table {
      width: 100%;
      border-collapse: collapse;
    }
    .metrics-table th {
      text-align: left;
      color: #8b949e;
      font-size: 0.75rem;
      text-transform: uppercase;
      padding: 0.375rem 0.75rem;
      border-bottom: 1px solid #30363d;
    }
    .metrics-table td {
      padding: 0.375rem 0.75rem;
      border-bottom: 1px solid #21262d;
    }
    .metric-name { color: #c9d1d9; }
    .metric-value {
      color: #f0f6fc;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .bar-cell { width: 30%; }
    .bar-track {
      background: #21262d;
      border-radius: 3px;
      height: 8px;
      overflow: hidden;
    }
    .bar-fill {
      background: #58a6ff;
      height: 100%;
      border-radius: 3px;
    }
    .files-section {
      margin-top: 1rem;
      padding-top: 0.75rem;
      border-top: 1px solid #21262d;
    }
    .files-toggle {
      color: #8b949e;
      font-size: 0.8125rem;
      text-transform: uppercase;
      cursor: pointer;
      margin-bottom: 0.5rem;
      list-style: none;
    }
    .files-toggle::-webkit-details-marker { display: none; }
    .files-toggle::before {
      content: "\\25B6";
      display: inline-block;
      margin-right: 0.375rem;
      font-size: 0.625rem;
      transition: transform 0.15s;
    }
    details[open] > .files-toggle::before {
      transform: rotate(90deg);
    }
    .file-entry { margin-bottom: 0.5rem; }
    .file-path {
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 0.8125rem;
      color: #58a6ff;
      padding: 0.25rem 0;
    }
    .file-metrics { margin-bottom: 0.5rem; }
    .no-data {
      color: #8b949e;
      font-style: italic;
    }
    .warnings-section {
      background: #161b22;
      border: 1px solid #da3633;
      border-radius: 6px;
      padding: 1.25rem;
      margin-bottom: 1rem;
    }
    .warnings-section h2 {
      color: #f85149;
      font-size: 1.125rem;
      margin-bottom: 0.75rem;
    }
    .warning-item {
      color: #c9d1d9;
      font-size: 0.875rem;
      padding: 0.25rem 0;
    }
    .warning-axis {
      color: #f0f6fc;
      font-weight: 600;
    }`;

/**
 * Formats a MeasurementReport as a self-contained HTML dashboard.
 *
 * Output is deterministic for identical input (Principle #3).
 */
export function formatHtml(report: MeasurementReport): string {
  const targetPath = escapeHtml(report.targetPath);
  const timestamp = escapeHtml(report.timestamp);

  const bodyParts: string[] = [];

  if (report.axes.length === 0 && report.warnings.length === 0) {
    bodyParts.push(`<p class="no-data">No axes measured.</p>`);
  } else {
    bodyParts.push(...report.axes.map(renderAxis));
  }

  if (report.warnings.length > 0) {
    const warningItems = report.warnings
      .map((w) => `<div class="warning-item"><span class="warning-axis">${escapeHtml(axisNameById(w.axisId))}</span>: ${escapeHtml(w.message)}</div>`)
      .join("\n");
    bodyParts.push(`<section class="warnings-section">\n<h2>Warnings</h2>\n${warningItems}\n</section>`);
  }

  const body = bodyParts.join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CodePulse Report</title>
  <style>${CSS}
  </style>
</head>
<body>
  <div class="header">
    <h1>CodePulse Report</h1>
    <div class="meta">${targetPath} &mdash; ${timestamp}</div>
  </div>
  ${body}
</body>
</html>`;
}
