/**
 * c8 adapter.
 *
 * Integrates the c8 external tool (https://github.com/bcoe/c8) with
 * CodePulse. c8 provides code coverage using Node.js' built-in V8
 * coverage and outputs Istanbul-compatible reports.
 *
 * This adapter supports one measurement axis:
 *   - "test-coverage" — line, statement, function, and branch coverage
 *
 * The adapter follows the Three-Line pattern:
 *   1. Invoke c8 report --reporter=json-summary --temp-directory=<target>/coverage/tmp
 *   2. Parse the coverage-summary.json output
 *   3. Map to CodePulse's AxisMeasurement schema
 */

import * as node_path from "node:path";
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
// c8 coverage-summary.json types
// ---------------------------------------------------------------------------

/**
 * A single coverage metric entry from Istanbul-format coverage-summary.json.
 */
export interface C8CoverageMetric {
  readonly total: number;
  readonly covered: number;
  readonly skipped: number;
  readonly pct: number;
}

/**
 * Coverage entry for a single file or the "total" aggregate.
 */
export interface C8CoverageEntry {
  readonly lines: C8CoverageMetric;
  readonly statements: C8CoverageMetric;
  readonly functions: C8CoverageMetric;
  readonly branches: C8CoverageMetric;
}

/**
 * The full coverage-summary.json structure.
 * Keys are "total" for the aggregate, and absolute file paths for per-file data.
 */
export interface C8CoverageSummary {
  readonly total: C8CoverageEntry;
  readonly [filePath: string]: C8CoverageEntry;
}

// ---------------------------------------------------------------------------
// Exec/Read function types — injectable for testing
// ---------------------------------------------------------------------------

export type C8ExecResult =
  | { readonly ok: true; readonly stdout: string }
  | { readonly ok: false; readonly error: string };

export type C8ExecFn = (args: readonly string[]) => Promise<C8ExecResult>;

export type C8ReadResult =
  | { readonly ok: true; readonly content: string }
  | { readonly ok: false; readonly error: string };

export type C8ReadFn = (path: string) => Promise<C8ReadResult>;

// ---------------------------------------------------------------------------
// Metric descriptors
// ---------------------------------------------------------------------------

const SUMMARY_DESCRIPTORS = {
  lineCoveragePct: {
    id: "line-coverage-pct",
    name: "Line Coverage",
    unit: "percent",
    min: 0,
    max: 100,
    interpretation: "Percentage of lines executed during tests",
  },
  statementCoveragePct: {
    id: "statement-coverage-pct",
    name: "Statement Coverage",
    unit: "percent",
    min: 0,
    max: 100,
    interpretation: "Percentage of statements executed during tests",
  },
  functionCoveragePct: {
    id: "function-coverage-pct",
    name: "Function Coverage",
    unit: "percent",
    min: 0,
    max: 100,
    interpretation: "Percentage of functions called during tests",
  },
  branchCoveragePct: {
    id: "branch-coverage-pct",
    name: "Branch Coverage",
    unit: "percent",
    min: 0,
    max: 100,
    interpretation: "Percentage of branches taken during tests",
  },
  totalLines: {
    id: "total-lines",
    name: "Total Lines",
    unit: "lines",
    min: 0,
    max: null,
    interpretation: "Total number of instrumentable lines",
  },
  coveredLines: {
    id: "covered-lines",
    name: "Covered Lines",
    unit: "lines",
    min: 0,
    max: null,
    interpretation: "Number of lines executed during tests",
  },
  totalFunctions: {
    id: "total-functions",
    name: "Total Functions",
    unit: "functions",
    min: 0,
    max: null,
    interpretation: "Total number of instrumentable functions",
  },
  coveredFunctions: {
    id: "covered-functions",
    name: "Covered Functions",
    unit: "functions",
    min: 0,
    max: null,
    interpretation: "Number of functions called during tests",
  },
  totalBranches: {
    id: "total-branches",
    name: "Total Branches",
    unit: "branches",
    min: 0,
    max: null,
    interpretation: "Total number of instrumentable branches",
  },
  coveredBranches: {
    id: "covered-branches",
    name: "Covered Branches",
    unit: "branches",
    min: 0,
    max: null,
    interpretation: "Number of branches taken during tests",
  },
} as const satisfies Record<string, MetricDescriptor>;

const FILE_DESCRIPTORS = {
  fileLineCoveragePct: {
    id: "file-line-coverage-pct",
    name: "Line Coverage",
    unit: "percent",
    min: 0,
    max: 100,
    interpretation: "Percentage of lines executed during tests for this file",
  },
  fileFunctionCoveragePct: {
    id: "file-function-coverage-pct",
    name: "Function Coverage",
    unit: "percent",
    min: 0,
    max: 100,
    interpretation: "Percentage of functions called during tests for this file",
  },
  fileBranchCoveragePct: {
    id: "file-branch-coverage-pct",
    name: "Branch Coverage",
    unit: "percent",
    min: 0,
    max: 100,
    interpretation: "Percentage of branches taken during tests for this file",
  },
} as const satisfies Record<string, MetricDescriptor>;

// ---------------------------------------------------------------------------
// Parsing — transforms c8 output into AxisMeasurement
// ---------------------------------------------------------------------------

function buildSummary(total: C8CoverageEntry): readonly MetricValue[] {
  return [
    { descriptor: SUMMARY_DESCRIPTORS.lineCoveragePct, value: total.lines.pct },
    { descriptor: SUMMARY_DESCRIPTORS.statementCoveragePct, value: total.statements.pct },
    { descriptor: SUMMARY_DESCRIPTORS.functionCoveragePct, value: total.functions.pct },
    { descriptor: SUMMARY_DESCRIPTORS.branchCoveragePct, value: total.branches.pct },
    { descriptor: SUMMARY_DESCRIPTORS.totalLines, value: total.lines.total },
    { descriptor: SUMMARY_DESCRIPTORS.coveredLines, value: total.lines.covered },
    { descriptor: SUMMARY_DESCRIPTORS.totalFunctions, value: total.functions.total },
    { descriptor: SUMMARY_DESCRIPTORS.coveredFunctions, value: total.functions.covered },
    { descriptor: SUMMARY_DESCRIPTORS.totalBranches, value: total.branches.total },
    { descriptor: SUMMARY_DESCRIPTORS.coveredBranches, value: total.branches.covered },
  ];
}

function buildFiles(summary: C8CoverageSummary): readonly FileMeasurement[] {
  const fileKeys = Object.keys(summary)
    .filter((key) => key !== "total")
    .sort();

  return fileKeys.map((filePath) => {
    const entry = summary[filePath]!;
    return {
      filePath,
      metrics: [
        { descriptor: FILE_DESCRIPTORS.fileLineCoveragePct, value: entry.lines.pct },
        { descriptor: FILE_DESCRIPTORS.fileFunctionCoveragePct, value: entry.functions.pct },
        { descriptor: FILE_DESCRIPTORS.fileBranchCoveragePct, value: entry.branches.pct },
      ],
    };
  });
}

/**
 * Parse c8 coverage-summary.json into a CodePulse AxisMeasurement.
 */
export function parseC8Output(summary: C8CoverageSummary): AxisMeasurement {
  return {
    axisId: "test-coverage",
    summary: buildSummary(summary.total),
    files: buildFiles(summary),
  };
}

// ---------------------------------------------------------------------------
// Default exec/read functions
// ---------------------------------------------------------------------------

async function defaultExecFn(args: readonly string[]): Promise<C8ExecResult> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  try {
    const { stdout } = await execFileAsync("npx", ["c8", ...args]);
    return { ok: true, stdout };
  } catch (cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, error: message };
  }
}

async function defaultReadFn(filePath: string): Promise<C8ReadResult> {
  const { readFile } = await import("node:fs/promises");
  try {
    const content = await readFile(filePath, "utf-8");
    return { ok: true, content };
  } catch (cause: unknown) {
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
 * Create a c8 adapter instance.
 *
 * @param execFn - Optional injectable exec function for testing.
 * @param readFn - Optional injectable file read function for testing.
 */
export function createC8Adapter(execFn?: C8ExecFn, readFn?: C8ReadFn): ToolAdapter {
  const exec = execFn ?? defaultExecFn;
  const read = readFn ?? defaultReadFn;

  return {
    id: "c8",
    toolName: "c8",
    supportedAxes: ["test-coverage"] as const,

    async checkAvailability(): Promise<ToolAvailability> {
      const result = await exec(["--version"]);
      if (!result.ok) {
        return { available: false, reason: `c8 is not available: ${result.error}` };
      }
      return { available: true, version: parseVersion(result.stdout) };
    },

    async measure(
      targetPath: string,
      _axisId: AxisId,
    ): Promise<Result<AxisMeasurement, AdapterError>> {
      // Step 1: Invoke c8 report to generate json-summary
      const tempDir = node_path.join(targetPath, "coverage", "tmp");
      const reportDir = node_path.join(targetPath, "coverage");

      const reportResult = await exec([
        "report",
        "--reporter=json-summary",
        `--temp-directory=${tempDir}`,
        `--reports-dir=${reportDir}`,
      ]);

      if (!reportResult.ok) {
        return err({
          adapterId: "c8",
          message: `c8 report execution failed: ${reportResult.error}`,
        });
      }

      // Step 2: Read the generated coverage-summary.json
      const summaryPath = node_path.join(reportDir, "coverage-summary.json");
      const readResult = await read(summaryPath);

      if (!readResult.ok) {
        return err({
          adapterId: "c8",
          message: `Failed to read coverage-summary.json: ${readResult.error}`,
        });
      }

      let summary: C8CoverageSummary;
      try {
        summary = JSON.parse(readResult.content) as C8CoverageSummary;
      } catch (cause: unknown) {
        return err({
          adapterId: "c8",
          message: `Failed to parse coverage-summary.json`,
          cause,
        });
      }

      // Step 3: Map to CodePulse schema
      return ok(parseC8Output(summary));
    },
  };
}
