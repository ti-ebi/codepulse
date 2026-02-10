/**
 * scc adapter.
 *
 * Integrates the scc external tool (https://github.com/boyter/scc) with
 * CodePulse. scc provides size and complexity measurements for source code.
 *
 * This adapter supports two measurement axes:
 *   - "size" — lines of code, file count, comment/blank lines
 *   - "complexity" — cyclomatic complexity per file and in aggregate
 *
 * The adapter follows the Three-Line pattern:
 *   1. Invoke scc with --format json --by-file
 *   2. Parse the JSON output into SccLanguageEntry[]
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
// scc JSON output types (subset of fields we use)
// ---------------------------------------------------------------------------

export interface SccFileEntry {
  readonly Language: string;
  readonly Filename: string;
  readonly Location: string;
  readonly Lines: number;
  readonly Code: number;
  readonly Comment: number;
  readonly Blank: number;
  readonly Complexity: number;
  readonly Bytes: number;
}

export interface SccLanguageEntry {
  readonly Name: string;
  readonly Lines: number;
  readonly Code: number;
  readonly Comment: number;
  readonly Blank: number;
  readonly Complexity: number;
  readonly Count: number;
  readonly Bytes: number;
  readonly Files: readonly SccFileEntry[];
}

// ---------------------------------------------------------------------------
// Exec function type — injectable for testing
// ---------------------------------------------------------------------------

export type SccExecResult =
  | { readonly ok: true; readonly stdout: string }
  | { readonly ok: false; readonly error: string };

export type SccExecFn = (args: readonly string[]) => Promise<SccExecResult>;

// ---------------------------------------------------------------------------
// Metric descriptors
// ---------------------------------------------------------------------------

const SIZE_DESCRIPTORS = {
  totalLines: {
    id: "total-lines",
    name: "Total Lines",
    unit: "lines",
    min: 0,
    max: null,
    interpretation: "Total number of lines including code, comments, and blanks",
  },
  codeLines: {
    id: "code-lines",
    name: "Code Lines",
    unit: "lines",
    min: 0,
    max: null,
    interpretation: "Lines containing executable code, excluding comments and blanks",
  },
  commentLines: {
    id: "comment-lines",
    name: "Comment Lines",
    unit: "lines",
    min: 0,
    max: null,
    interpretation: "Lines containing comments",
  },
  blankLines: {
    id: "blank-lines",
    name: "Blank Lines",
    unit: "lines",
    min: 0,
    max: null,
    interpretation: "Empty lines or lines containing only whitespace",
  },
  fileCount: {
    id: "file-count",
    name: "File Count",
    unit: "files",
    min: 0,
    max: null,
    interpretation: "Number of source files analyzed",
  },
  totalBytes: {
    id: "total-bytes",
    name: "Total Bytes",
    unit: "bytes",
    min: 0,
    max: null,
    interpretation: "Total size of all analyzed files in bytes",
  },
} as const satisfies Record<string, MetricDescriptor>;

const COMPLEXITY_DESCRIPTORS = {
  totalComplexity: {
    id: "total-complexity",
    name: "Total Complexity",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Sum of cyclomatic complexity across all files",
  },
  averageComplexityPerFile: {
    id: "average-complexity-per-file",
    name: "Average Complexity per File",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Mean cyclomatic complexity per file",
  },
  cyclomaticComplexity: {
    id: "cyclomatic-complexity",
    name: "Cyclomatic Complexity",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Number of linearly independent paths through the file",
  },
  complexityPerCodeLine: {
    id: "complexity-per-code-line",
    name: "Complexity per Code Line",
    unit: "ratio",
    min: 0,
    max: null,
    interpretation: "Cyclomatic complexity divided by number of code lines",
  },
} as const satisfies Record<string, MetricDescriptor>;

// ---------------------------------------------------------------------------
// Parsing — transforms scc JSON output into AxisMeasurement
// ---------------------------------------------------------------------------

function collectAllFiles(
  entries: readonly SccLanguageEntry[],
): readonly SccFileEntry[] {
  const files: SccFileEntry[] = [];
  for (const lang of entries) {
    for (const file of lang.Files) {
      files.push(file);
    }
  }
  return files;
}

function buildSizeSummary(
  entries: readonly SccLanguageEntry[],
): readonly MetricValue[] {
  let totalLines = 0;
  let codeLines = 0;
  let commentLines = 0;
  let blankLines = 0;
  let fileCount = 0;
  let totalBytes = 0;

  for (const lang of entries) {
    totalLines += lang.Lines;
    codeLines += lang.Code;
    commentLines += lang.Comment;
    blankLines += lang.Blank;
    fileCount += lang.Count;
    totalBytes += lang.Bytes;
  }

  return [
    { descriptor: SIZE_DESCRIPTORS.totalLines, value: totalLines },
    { descriptor: SIZE_DESCRIPTORS.codeLines, value: codeLines },
    { descriptor: SIZE_DESCRIPTORS.commentLines, value: commentLines },
    { descriptor: SIZE_DESCRIPTORS.blankLines, value: blankLines },
    { descriptor: SIZE_DESCRIPTORS.fileCount, value: fileCount },
    { descriptor: SIZE_DESCRIPTORS.totalBytes, value: totalBytes },
  ];
}

function buildSizeFiles(
  files: readonly SccFileEntry[],
): readonly FileMeasurement[] {
  return files.map((f) => ({
    filePath: f.Location,
    metrics: [
      { descriptor: SIZE_DESCRIPTORS.totalLines, value: f.Lines },
      { descriptor: SIZE_DESCRIPTORS.codeLines, value: f.Code },
      { descriptor: SIZE_DESCRIPTORS.commentLines, value: f.Comment },
      { descriptor: SIZE_DESCRIPTORS.blankLines, value: f.Blank },
      { descriptor: SIZE_DESCRIPTORS.totalBytes, value: f.Bytes },
    ],
  }));
}

function buildComplexitySummary(
  entries: readonly SccLanguageEntry[],
  fileCount: number,
): readonly MetricValue[] {
  let totalComplexity = 0;
  for (const lang of entries) {
    totalComplexity += lang.Complexity;
  }

  const avg = fileCount > 0 ? totalComplexity / fileCount : 0;

  return [
    { descriptor: COMPLEXITY_DESCRIPTORS.totalComplexity, value: totalComplexity },
    { descriptor: COMPLEXITY_DESCRIPTORS.averageComplexityPerFile, value: avg },
  ];
}

function buildComplexityFiles(
  files: readonly SccFileEntry[],
): readonly FileMeasurement[] {
  return files.map((f) => ({
    filePath: f.Location,
    metrics: [
      { descriptor: COMPLEXITY_DESCRIPTORS.cyclomaticComplexity, value: f.Complexity },
      {
        descriptor: COMPLEXITY_DESCRIPTORS.complexityPerCodeLine,
        value: f.Code > 0 ? f.Complexity / f.Code : 0,
      },
    ],
  }));
}

/**
 * Parse raw scc JSON output into a CodePulse AxisMeasurement.
 */
export function parseSccOutput(
  entries: readonly SccLanguageEntry[],
  axisId: AxisId,
): AxisMeasurement {
  const allFiles = collectAllFiles(entries);

  if (axisId === "size") {
    return {
      axisId: "size",
      summary: buildSizeSummary(entries),
      files: buildSizeFiles(allFiles),
    };
  }

  // complexity axis
  const totalFileCount = allFiles.length;
  return {
    axisId: "complexity",
    summary: buildComplexitySummary(entries, totalFileCount),
    files: buildComplexityFiles(allFiles),
  };
}

// ---------------------------------------------------------------------------
// Default exec function — invokes scc via child_process
// ---------------------------------------------------------------------------

async function defaultExecFn(args: readonly string[]): Promise<SccExecResult> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  try {
    const { stdout } = await execFileAsync("scc", [...args]);
    return { ok: true, stdout };
  } catch (cause: unknown) {
    const message =
      cause instanceof Error ? cause.message : String(cause);
    return { ok: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Adapter factory
// ---------------------------------------------------------------------------

function parseVersion(stdout: string): string {
  // scc --version outputs "scc version X.Y.Z"
  const match = /(\d+\.\d+\.\d+)/.exec(stdout);
  return match?.[1] ?? "unknown";
}

/**
 * Create an scc adapter instance.
 *
 * @param execFn - Optional injectable exec function for testing.
 *                 Defaults to invoking the real scc binary.
 */
export function createSccAdapter(execFn?: SccExecFn): ToolAdapter {
  const exec = execFn ?? defaultExecFn;

  return {
    id: "scc",
    toolName: "scc",
    supportedAxes: ["complexity", "size"] as const,

    async checkAvailability(): Promise<ToolAvailability> {
      const result = await exec(["--version"]);
      if (!result.ok) {
        return { available: false, reason: `scc is not available: ${result.error}` };
      }
      return { available: true, version: parseVersion(result.stdout) };
    },

    async measure(
      targetPath: string,
      axisId: AxisId,
    ): Promise<Result<AxisMeasurement, AdapterError>> {
      const result = await exec([
        "--format", "json",
        "--by-file",
        targetPath,
      ]);

      if (!result.ok) {
        return err({
          adapterId: "scc",
          message: `scc execution failed: ${result.error}`,
        });
      }

      let parsed: SccLanguageEntry[];
      try {
        parsed = JSON.parse(result.stdout) as SccLanguageEntry[];
      } catch (cause: unknown) {
        return err({
          adapterId: "scc",
          message: `Failed to parse scc JSON output`,
          cause,
        });
      }

      return ok(parseSccOutput(parsed, axisId));
    },
  };
}
