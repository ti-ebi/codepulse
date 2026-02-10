/**
 * Semgrep adapter.
 *
 * Integrates the Semgrep external tool (https://semgrep.dev/) with CodePulse.
 * Semgrep performs static analysis to detect known vulnerability patterns
 * across multiple languages using rule-based matching.
 *
 * This adapter supports one measurement axis:
 *   - "security" — known vulnerability patterns (static only)
 *
 * The adapter follows the Three-Line pattern:
 *   1. Invoke semgrep --json --config auto <target>
 *   2. Parse the JSON output
 *   3. Map to CodePulse's AxisMeasurement schema
 */

import type { AxisId } from "../types/axis.js";
import type {
  AxisMeasurement,
  FileMeasurement,
  MetricDescriptor,
  MetricValue,
} from "../types/measurement.js";
import type { Result } from "../types/result.js";
import { ok, err } from "../types/result.js";
import type { AdapterError, ToolAdapter, ToolAvailability } from "./adapter.js";

// ---------------------------------------------------------------------------
// Semgrep JSON output types
// ---------------------------------------------------------------------------

/**
 * A single finding from Semgrep's JSON output.
 */
export interface SemgrepFinding {
  readonly check_id: string;
  readonly path: string;
  readonly start: { readonly line: number; readonly col: number };
  readonly end: { readonly line: number; readonly col: number };
  readonly extra: {
    readonly message: string;
    readonly severity: string;
    readonly metadata: Record<string, unknown>;
  };
}

/**
 * Top-level Semgrep JSON output structure.
 */
export interface SemgrepResult {
  readonly results: readonly SemgrepFinding[];
  readonly errors: readonly unknown[];
}

// ---------------------------------------------------------------------------
// Exec function type — injectable for testing
// ---------------------------------------------------------------------------

export type SemgrepExecResult =
  | { readonly ok: true; readonly stdout: string }
  | { readonly ok: false; readonly error: string };

export type SemgrepExecFn = (args: readonly string[]) => Promise<SemgrepExecResult>;

// ---------------------------------------------------------------------------
// Metric descriptors
// ---------------------------------------------------------------------------

const SUMMARY_DESCRIPTORS = {
  totalFindings: {
    id: "total-findings",
    name: "Total Findings",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Total number of security findings across all files",
  },
  errorFindings: {
    id: "error-findings",
    name: "Error Findings",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Number of findings with error severity",
  },
  warningFindings: {
    id: "warning-findings",
    name: "Warning Findings",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Number of findings with warning severity",
  },
  infoFindings: {
    id: "info-findings",
    name: "Info Findings",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Number of findings with info severity",
  },
  filesWithFindings: {
    id: "files-with-findings",
    name: "Files with Findings",
    unit: "files",
    min: 0,
    max: null,
    interpretation: "Number of files containing at least one security finding",
  },
  uniqueRulesTriggered: {
    id: "unique-rules-triggered",
    name: "Unique Rules Triggered",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Number of distinct security rules that produced findings",
  },
} as const satisfies Record<string, MetricDescriptor>;

const FILE_DESCRIPTORS = {
  fileFindingCount: {
    id: "file-finding-count",
    name: "Finding Count",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Total number of security findings in this file",
  },
  fileErrorCount: {
    id: "file-error-count",
    name: "Error Count",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Number of error-severity findings in this file",
  },
  fileWarningCount: {
    id: "file-warning-count",
    name: "Warning Count",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Number of warning-severity findings in this file",
  },
} as const satisfies Record<string, MetricDescriptor>;

// ---------------------------------------------------------------------------
// Parsing — transforms Semgrep output into AxisMeasurement
// ---------------------------------------------------------------------------

function buildSummary(findings: readonly SemgrepFinding[]): readonly MetricValue[] {
  const totalFindings = findings.length;
  const errorFindings = findings.filter((f) => f.extra.severity === "ERROR").length;
  const warningFindings = findings.filter((f) => f.extra.severity === "WARNING").length;
  const infoFindings = findings.filter((f) => f.extra.severity === "INFO").length;
  const uniqueFiles = new Set(findings.map((f) => f.path));
  const uniqueRules = new Set(findings.map((f) => f.check_id));

  return [
    { descriptor: SUMMARY_DESCRIPTORS.totalFindings, value: totalFindings },
    { descriptor: SUMMARY_DESCRIPTORS.errorFindings, value: errorFindings },
    { descriptor: SUMMARY_DESCRIPTORS.warningFindings, value: warningFindings },
    { descriptor: SUMMARY_DESCRIPTORS.infoFindings, value: infoFindings },
    { descriptor: SUMMARY_DESCRIPTORS.filesWithFindings, value: uniqueFiles.size },
    { descriptor: SUMMARY_DESCRIPTORS.uniqueRulesTriggered, value: uniqueRules.size },
  ];
}

function buildFiles(findings: readonly SemgrepFinding[]): readonly FileMeasurement[] {
  const byFile = new Map<string, SemgrepFinding[]>();
  for (const finding of findings) {
    const existing = byFile.get(finding.path);
    if (existing) {
      existing.push(finding);
    } else {
      byFile.set(finding.path, [finding]);
    }
  }

  const filePaths = [...byFile.keys()].sort((a, b) => a.localeCompare(b));

  return filePaths.map((filePath) => {
    const fileFindings = byFile.get(filePath)!;
    const errorCount = fileFindings.filter((f) => f.extra.severity === "ERROR").length;
    const warningCount = fileFindings.filter((f) => f.extra.severity === "WARNING").length;

    return {
      filePath,
      metrics: [
        { descriptor: FILE_DESCRIPTORS.fileFindingCount, value: fileFindings.length },
        { descriptor: FILE_DESCRIPTORS.fileErrorCount, value: errorCount },
        { descriptor: FILE_DESCRIPTORS.fileWarningCount, value: warningCount },
      ],
    };
  });
}

/**
 * Parse Semgrep JSON output into a CodePulse AxisMeasurement.
 */
export function parseSemgrepOutput(report: SemgrepResult): AxisMeasurement {
  return {
    axisId: "security",
    summary: buildSummary(report.results),
    files: buildFiles(report.results),
  };
}

// ---------------------------------------------------------------------------
// Default exec function — invokes semgrep via npx
// ---------------------------------------------------------------------------

async function defaultExecFn(args: readonly string[]): Promise<SemgrepExecResult> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  try {
    const { stdout } = await execFileAsync("npx", ["semgrep", ...args]);
    return { ok: true, stdout };
  } catch (cause: unknown) {
    // Semgrep may exit with a non-zero code when findings are present
    // but still produce valid JSON on stdout.
    if (
      cause instanceof Error &&
      "stdout" in cause &&
      typeof (cause as { stdout: unknown }).stdout === "string"
    ) {
      const stdout = (cause as { stdout: string }).stdout;
      if (stdout.trim().startsWith("{")) {
        return { ok: true, stdout };
      }
    }
    const message = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Adapter factory
// ---------------------------------------------------------------------------

function parseVersion(stdout: string): string {
  const trimmed = stdout.trim();
  const match = /(\d+\.\d+\.\d+)/.exec(trimmed);
  return match?.[1] ?? (trimmed || "unknown");
}

/**
 * Create a Semgrep adapter instance.
 *
 * @param execFn - Optional injectable exec function for testing.
 */
export function createSemgrepAdapter(execFn?: SemgrepExecFn): ToolAdapter {
  const exec = execFn ?? defaultExecFn;

  return {
    id: "semgrep",
    toolName: "Semgrep",
    supportedAxes: ["security"] as const,

    async checkAvailability(): Promise<ToolAvailability> {
      const result = await exec(["--version"]);
      if (!result.ok) {
        return { available: false, reason: `Semgrep is not available: ${result.error}` };
      }
      return { available: true, version: parseVersion(result.stdout) };
    },

    async measure(
      targetPath: string,
      _axisId: AxisId,
    ): Promise<Result<AxisMeasurement, AdapterError>> {
      // Step 1: Invoke Semgrep with JSON output and auto config
      const result = await exec(["--json", "--config", "auto", targetPath]);

      if (!result.ok) {
        return err({
          adapterId: "semgrep",
          message: `Semgrep execution failed: ${result.error}`,
        });
      }

      // Step 2: Parse the JSON output
      let report: SemgrepResult;
      try {
        report = JSON.parse(result.stdout) as SemgrepResult;
      } catch (cause: unknown) {
        return err({
          adapterId: "semgrep",
          message: `Failed to parse Semgrep JSON output`,
          cause,
        });
      }

      // Step 3: Map to CodePulse schema
      return ok(parseSemgrepOutput(report));
    },
  };
}
