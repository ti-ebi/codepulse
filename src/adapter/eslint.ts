/**
 * ESLint adapter.
 *
 * Integrates the ESLint external tool (https://eslint.org/) with CodePulse.
 * ESLint analyzes JavaScript/TypeScript code for potential errors and style
 * violations using configurable rule sets.
 *
 * This adapter supports one measurement axis:
 *   - "consistency" — naming conventions, formatting uniformity
 *
 * The adapter follows the Three-Line pattern:
 *   1. Invoke eslint --format json <target>
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
// ESLint JSON output types
// ---------------------------------------------------------------------------

/**
 * A single lint message from ESLint's JSON output.
 */
export interface EslintMessage {
  readonly ruleId: string | null;
  readonly severity: number;
  readonly message: string;
}

/**
 * Per-file result from ESLint's --format json output.
 */
export interface EslintFileResult {
  readonly filePath: string;
  readonly messages: readonly EslintMessage[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly fixableErrorCount: number;
  readonly fixableWarningCount: number;
}

// ---------------------------------------------------------------------------
// Exec function type — injectable for testing
// ---------------------------------------------------------------------------

export type EslintExecResult =
  | { readonly ok: true; readonly stdout: string }
  | { readonly ok: false; readonly error: string };

export type EslintExecFn = (args: readonly string[]) => Promise<EslintExecResult>;

// ---------------------------------------------------------------------------
// Metric descriptors
// ---------------------------------------------------------------------------

const SUMMARY_DESCRIPTORS = {
  totalFilesLinted: {
    id: "total-files-linted",
    name: "Total Files Linted",
    unit: "files",
    min: 0,
    max: null,
    interpretation: "Total number of files analyzed by the linter",
  },
  totalErrors: {
    id: "total-errors",
    name: "Total Errors",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Total number of linting errors across all files",
  },
  totalWarnings: {
    id: "total-warnings",
    name: "Total Warnings",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Total number of linting warnings across all files",
  },
  totalIssues: {
    id: "total-issues",
    name: "Total Issues",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Total number of linting issues (errors + warnings) across all files",
  },
  cleanFiles: {
    id: "clean-files",
    name: "Clean Files",
    unit: "files",
    min: 0,
    max: null,
    interpretation: "Number of files with zero linting issues",
  },
  cleanFileRatio: {
    id: "clean-file-ratio",
    name: "Clean File Ratio",
    unit: "percent",
    min: 0,
    max: 100,
    interpretation: "Percentage of files with zero linting issues",
  },
} as const satisfies Record<string, MetricDescriptor>;

const FILE_DESCRIPTORS = {
  fileErrorCount: {
    id: "file-error-count",
    name: "Error Count",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Number of linting errors in this file",
  },
  fileWarningCount: {
    id: "file-warning-count",
    name: "Warning Count",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Number of linting warnings in this file",
  },
  fileIssueCount: {
    id: "file-issue-count",
    name: "Issue Count",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Total number of linting issues in this file",
  },
} as const satisfies Record<string, MetricDescriptor>;

// ---------------------------------------------------------------------------
// Parsing — transforms ESLint output into AxisMeasurement
// ---------------------------------------------------------------------------

function buildSummary(files: readonly EslintFileResult[]): readonly MetricValue[] {
  const totalFiles = files.length;
  const totalErrors = files.reduce((sum, f) => sum + f.errorCount, 0);
  const totalWarnings = files.reduce((sum, f) => sum + f.warningCount, 0);
  const totalIssues = totalErrors + totalWarnings;
  const cleanFiles = files.filter((f) => f.errorCount === 0 && f.warningCount === 0).length;
  const cleanFileRatio = totalFiles > 0 ? (cleanFiles / totalFiles) * 100 : 100;

  return [
    { descriptor: SUMMARY_DESCRIPTORS.totalFilesLinted, value: totalFiles },
    { descriptor: SUMMARY_DESCRIPTORS.totalErrors, value: totalErrors },
    { descriptor: SUMMARY_DESCRIPTORS.totalWarnings, value: totalWarnings },
    { descriptor: SUMMARY_DESCRIPTORS.totalIssues, value: totalIssues },
    { descriptor: SUMMARY_DESCRIPTORS.cleanFiles, value: cleanFiles },
    { descriptor: SUMMARY_DESCRIPTORS.cleanFileRatio, value: cleanFileRatio },
  ];
}

function buildFiles(files: readonly EslintFileResult[]): readonly FileMeasurement[] {
  const sorted = [...files].sort((a, b) => a.filePath.localeCompare(b.filePath));

  return sorted.map((f) => ({
    filePath: f.filePath,
    metrics: [
      { descriptor: FILE_DESCRIPTORS.fileErrorCount, value: f.errorCount },
      { descriptor: FILE_DESCRIPTORS.fileWarningCount, value: f.warningCount },
      { descriptor: FILE_DESCRIPTORS.fileIssueCount, value: f.errorCount + f.warningCount },
    ],
  }));
}

/**
 * Parse ESLint JSON output into a CodePulse AxisMeasurement.
 */
export function parseEslintOutput(files: readonly EslintFileResult[]): AxisMeasurement {
  return {
    axisId: "consistency",
    summary: buildSummary(files),
    files: buildFiles(files),
  };
}

// ---------------------------------------------------------------------------
// Default exec function — invokes eslint via npx
// ---------------------------------------------------------------------------

async function defaultExecFn(args: readonly string[]): Promise<EslintExecResult> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  try {
    const { stdout } = await execFileAsync("npx", ["eslint", ...args]);
    return { ok: true, stdout };
  } catch (cause: unknown) {
    // ESLint exits with code 1 when lint issues are found but execution
    // succeeded. If stdout contains valid JSON, treat it as success.
    if (
      cause instanceof Error &&
      "stdout" in cause &&
      typeof (cause as { stdout: unknown }).stdout === "string"
    ) {
      const stdout = (cause as { stdout: string }).stdout;
      if (stdout.trim().startsWith("[")) {
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
 * Create an ESLint adapter instance.
 *
 * @param execFn - Optional injectable exec function for testing.
 */
export function createEslintAdapter(execFn?: EslintExecFn): ToolAdapter {
  const exec = execFn ?? defaultExecFn;

  return {
    id: "eslint",
    toolName: "ESLint",
    supportedAxes: ["consistency"] as const,

    async checkAvailability(): Promise<ToolAvailability> {
      const result = await exec(["--version"]);
      if (!result.ok) {
        return { available: false, reason: `ESLint is not available: ${result.error}` };
      }
      return { available: true, version: parseVersion(result.stdout) };
    },

    async measure(
      targetPath: string,
      _axisId: AxisId,
    ): Promise<Result<AxisMeasurement, AdapterError>> {
      // Step 1: Invoke ESLint with JSON output format
      const result = await exec(["--format", "json", targetPath]);

      if (!result.ok) {
        return err({
          adapterId: "eslint",
          message: `ESLint execution failed: ${result.error}`,
        });
      }

      // Step 2: Parse the JSON output
      let files: EslintFileResult[];
      try {
        files = JSON.parse(result.stdout) as EslintFileResult[];
      } catch (cause: unknown) {
        return err({
          adapterId: "eslint",
          message: `Failed to parse ESLint JSON output`,
          cause,
        });
      }

      // Step 3: Map to CodePulse schema
      return ok(parseEslintOutput(files));
    },
  };
}
