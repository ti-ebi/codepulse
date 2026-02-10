/**
 * knip adapter.
 *
 * Integrates the knip external tool (https://knip.dev/) with CodePulse.
 * knip finds unused files, exports, types, and dependencies in
 * JavaScript/TypeScript projects.
 *
 * This adapter supports one measurement axis:
 *   - "dead-code" — unused files, exports, types, dependencies
 *
 * The adapter follows the Three-Line pattern:
 *   1. Invoke knip with --reporter json --directory <targetPath>
 *   2. Parse the JSON output from stdout
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
// knip JSON report types (subset of fields we use)
// ---------------------------------------------------------------------------

export interface KnipIssueRef {
  readonly name: string;
  readonly line?: number;
  readonly col?: number;
  readonly pos?: number;
}

export interface KnipFileIssues {
  readonly file: string;
  readonly dependencies: readonly KnipIssueRef[];
  readonly devDependencies: readonly KnipIssueRef[];
  readonly optionalPeerDependencies: readonly KnipIssueRef[];
  readonly unlisted: readonly KnipIssueRef[];
  readonly binaries: readonly KnipIssueRef[];
  readonly unresolved: readonly KnipIssueRef[];
  readonly exports: readonly KnipIssueRef[];
  readonly types: readonly KnipIssueRef[];
  readonly enumMembers: Readonly<Record<string, readonly KnipIssueRef[]>>;
  readonly duplicates: readonly string[];
}

export interface KnipReport {
  readonly files: readonly string[];
  readonly issues: readonly KnipFileIssues[];
}

// ---------------------------------------------------------------------------
// Exec function type — injectable for testing
// ---------------------------------------------------------------------------

export type KnipExecResult =
  | { readonly ok: true; readonly stdout: string }
  | { readonly ok: false; readonly error: string };

export type KnipExecFn = (args: readonly string[]) => Promise<KnipExecResult>;

// ---------------------------------------------------------------------------
// Metric descriptors
// ---------------------------------------------------------------------------

const SUMMARY_DESCRIPTORS = {
  unusedFiles: {
    id: "unused-files",
    name: "Unused Files",
    unit: "files",
    min: 0,
    max: null,
    interpretation: "Number of source files that are never imported or referenced",
  },
  unusedExports: {
    id: "unused-exports",
    name: "Unused Exports",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Number of exported symbols that are never imported by other modules",
  },
  unusedTypes: {
    id: "unused-types",
    name: "Unused Types",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Number of exported type definitions that are never referenced",
  },
  unusedDependencies: {
    id: "unused-dependencies",
    name: "Unused Dependencies",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Number of declared dependencies that are never imported",
  },
  unresolvedImports: {
    id: "unresolved-imports",
    name: "Unresolved Imports",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Number of import specifiers that cannot be resolved to a module",
  },
  duplicateExports: {
    id: "duplicate-exports",
    name: "Duplicate Exports",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Number of symbols exported more than once under different names",
  },
  totalIssues: {
    id: "total-issues",
    name: "Total Issues",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Total number of dead code issues detected across all categories",
  },
} as const satisfies Record<string, MetricDescriptor>;

const FILE_DESCRIPTORS = {
  fileIsOrphaned: {
    id: "file-is-orphaned",
    name: "Orphaned",
    unit: "boolean",
    min: 0,
    max: 1,
    interpretation: "Whether this file is never imported or referenced (1 = orphaned, 0 = referenced)",
  },
  fileUnusedExports: {
    id: "file-unused-exports",
    name: "Unused Exports",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Number of exported symbols in this file that are never imported",
  },
  fileUnusedTypes: {
    id: "file-unused-types",
    name: "Unused Types",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Number of exported type definitions in this file that are never referenced",
  },
} as const satisfies Record<string, MetricDescriptor>;

// ---------------------------------------------------------------------------
// Parsing — transforms knip JSON report into AxisMeasurement
// ---------------------------------------------------------------------------

function countEnumMembers(enumMembers: Readonly<Record<string, readonly KnipIssueRef[]>>): number {
  let count = 0;
  for (const members of Object.values(enumMembers)) {
    count += members.length;
  }
  return count;
}

function hasIssues(issue: KnipFileIssues): boolean {
  return (
    issue.exports.length > 0 ||
    issue.types.length > 0 ||
    issue.dependencies.length > 0 ||
    issue.devDependencies.length > 0 ||
    issue.unresolved.length > 0 ||
    issue.duplicates.length > 0 ||
    countEnumMembers(issue.enumMembers) > 0
  );
}

function buildSummary(report: KnipReport): readonly MetricValue[] {
  let unusedExports = 0;
  let unusedTypes = 0;
  let unusedDependencies = 0;
  let unresolvedImports = 0;
  let duplicateExports = 0;

  for (const issue of report.issues) {
    unusedExports += issue.exports.length;
    unusedTypes += issue.types.length;
    unusedDependencies += issue.dependencies.length + issue.devDependencies.length;
    unresolvedImports += issue.unresolved.length;
    duplicateExports += issue.duplicates.length;
  }

  const totalIssues =
    report.files.length +
    unusedExports +
    unusedTypes +
    unusedDependencies +
    unresolvedImports +
    duplicateExports;

  return [
    { descriptor: SUMMARY_DESCRIPTORS.unusedFiles, value: report.files.length },
    { descriptor: SUMMARY_DESCRIPTORS.unusedExports, value: unusedExports },
    { descriptor: SUMMARY_DESCRIPTORS.unusedTypes, value: unusedTypes },
    { descriptor: SUMMARY_DESCRIPTORS.unusedDependencies, value: unusedDependencies },
    { descriptor: SUMMARY_DESCRIPTORS.unresolvedImports, value: unresolvedImports },
    { descriptor: SUMMARY_DESCRIPTORS.duplicateExports, value: duplicateExports },
    { descriptor: SUMMARY_DESCRIPTORS.totalIssues, value: totalIssues },
  ];
}

function buildFiles(report: KnipReport): readonly FileMeasurement[] {
  const files: FileMeasurement[] = [];

  // Orphaned files
  for (const filePath of report.files) {
    files.push({
      filePath,
      metrics: [
        { descriptor: FILE_DESCRIPTORS.fileIsOrphaned, value: 1 },
        { descriptor: FILE_DESCRIPTORS.fileUnusedExports, value: 0 },
        { descriptor: FILE_DESCRIPTORS.fileUnusedTypes, value: 0 },
      ],
    });
  }

  // Files with issues (exports, types, etc.)
  for (const issue of report.issues) {
    if (!hasIssues(issue)) {
      continue;
    }

    files.push({
      filePath: issue.file,
      metrics: [
        { descriptor: FILE_DESCRIPTORS.fileIsOrphaned, value: 0 },
        { descriptor: FILE_DESCRIPTORS.fileUnusedExports, value: issue.exports.length },
        { descriptor: FILE_DESCRIPTORS.fileUnusedTypes, value: issue.types.length },
      ],
    });
  }

  return files;
}

/**
 * Parse a knip JSON report into a CodePulse AxisMeasurement.
 */
export function parseKnipReport(report: KnipReport): AxisMeasurement {
  return {
    axisId: "dead-code",
    summary: buildSummary(report),
    files: buildFiles(report),
  };
}

// ---------------------------------------------------------------------------
// Default exec function — invokes knip via npx
// ---------------------------------------------------------------------------

async function defaultExecFn(args: readonly string[]): Promise<KnipExecResult> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  try {
    const { stdout } = await execFileAsync("npx", ["knip", ...args]);
    return { ok: true, stdout };
  } catch (cause: unknown) {
    // knip exits with code 1 when it finds issues — check if stdout has JSON
    if (cause instanceof Error && "stdout" in cause) {
      const stdout = (cause as { stdout: string }).stdout;
      if (stdout && stdout.trim().startsWith("{")) {
        return { ok: true, stdout };
      }
    }
    const message =
      cause instanceof Error ? cause.message : String(cause);
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
 * Create a knip adapter instance.
 *
 * @param execFn - Optional injectable exec function for testing.
 */
export function createKnipAdapter(execFn?: KnipExecFn): ToolAdapter {
  const exec = execFn ?? defaultExecFn;

  return {
    id: "knip",
    toolName: "knip",
    supportedAxes: ["dead-code"] as const,

    async checkAvailability(): Promise<ToolAvailability> {
      const result = await exec(["--version"]);
      if (!result.ok) {
        return { available: false, reason: `knip is not available: ${result.error}` };
      }
      return { available: true, version: parseVersion(result.stdout) };
    },

    async measure(
      targetPath: string,
      _axisId: AxisId,
    ): Promise<Result<AxisMeasurement, AdapterError>> {
      const execResult = await exec([
        "--reporter", "json",
        "--directory", targetPath,
      ]);

      if (!execResult.ok) {
        return err({
          adapterId: "knip",
          message: `knip execution failed: ${execResult.error}`,
        });
      }

      let parsed: KnipReport;
      try {
        parsed = JSON.parse(execResult.stdout) as KnipReport;
      } catch (cause: unknown) {
        return err({
          adapterId: "knip",
          message: `Failed to parse knip JSON output`,
          cause,
        });
      }

      return ok(parseKnipReport(parsed));
    },
  };
}
