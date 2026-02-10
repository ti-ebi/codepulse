/**
 * jscpd adapter.
 *
 * Integrates the jscpd external tool (https://github.com/kucherenko/jscpd)
 * with CodePulse. jscpd provides copy-paste detection across codebases.
 *
 * This adapter supports one measurement axis:
 *   - "duplication" — clone count, duplicated lines, duplication percentage
 *
 * The adapter follows the Three-Line pattern:
 *   1. Invoke jscpd with --reporters json --output <tmpDir>
 *   2. Read and parse the jscpd-report.json file
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
// jscpd JSON report types (subset of fields we use)
// ---------------------------------------------------------------------------

export interface JscpdSourceStats {
  readonly lines: number;
  readonly tokens: number;
  readonly sources: number;
  readonly clones: number;
  readonly duplicatedLines: number;
  readonly duplicatedTokens: number;
  readonly percentage: number;
  readonly percentageTokens: number;
  readonly newDuplicatedLines: number;
  readonly newClones: number;
}

export interface JscpdFormatEntry {
  readonly sources: Readonly<Record<string, JscpdSourceStats>>;
  readonly total: JscpdSourceStats;
}

export interface JscpdReport {
  readonly statistics: {
    readonly formats: Readonly<Record<string, JscpdFormatEntry>>;
    readonly total: JscpdSourceStats;
  };
  readonly duplicates: readonly unknown[];
}

// ---------------------------------------------------------------------------
// Exec and read function types — injectable for testing
// ---------------------------------------------------------------------------

export type JscpdExecResult =
  | { readonly ok: true; readonly stdout: string }
  | { readonly ok: false; readonly error: string };

export type JscpdExecFn = (args: readonly string[]) => Promise<JscpdExecResult>;

export type JscpdReadFn = (path: string) => Promise<string>;

// ---------------------------------------------------------------------------
// Metric descriptors
// ---------------------------------------------------------------------------

const DUPLICATION_DESCRIPTORS = {
  totalClones: {
    id: "total-clones",
    name: "Total Clones",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Number of duplicated code blocks detected across the codebase",
  },
  duplicatedLines: {
    id: "duplicated-lines",
    name: "Duplicated Lines",
    unit: "lines",
    min: 0,
    max: null,
    interpretation: "Total number of lines that appear in duplicated blocks",
  },
  duplicationPercentage: {
    id: "duplication-percentage",
    name: "Duplication Percentage",
    unit: "percent",
    min: 0,
    max: 100,
    interpretation: "Percentage of total lines that are duplicated",
  },
  totalSources: {
    id: "total-sources",
    name: "Total Sources",
    unit: "files",
    min: 0,
    max: null,
    interpretation: "Number of source files analyzed for duplication",
  },
  totalLines: {
    id: "total-lines",
    name: "Total Lines",
    unit: "lines",
    min: 0,
    max: null,
    interpretation: "Total number of lines across all analyzed files",
  },
} as const satisfies Record<string, MetricDescriptor>;

const FILE_DESCRIPTORS = {
  fileClones: {
    id: "file-clones",
    name: "Clones",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Number of duplicated code blocks in this file",
  },
  fileDuplicatedLines: {
    id: "file-duplicated-lines",
    name: "Duplicated Lines",
    unit: "lines",
    min: 0,
    max: null,
    interpretation: "Number of duplicated lines in this file",
  },
  fileDuplicationPercentage: {
    id: "file-duplication-percentage",
    name: "Duplication Percentage",
    unit: "percent",
    min: 0,
    max: 100,
    interpretation: "Percentage of lines in this file that are duplicated",
  },
} as const satisfies Record<string, MetricDescriptor>;

// ---------------------------------------------------------------------------
// Parsing — transforms jscpd JSON report into AxisMeasurement
// ---------------------------------------------------------------------------

function buildSummary(total: JscpdSourceStats): readonly MetricValue[] {
  return [
    { descriptor: DUPLICATION_DESCRIPTORS.totalClones, value: total.clones },
    { descriptor: DUPLICATION_DESCRIPTORS.duplicatedLines, value: total.duplicatedLines },
    { descriptor: DUPLICATION_DESCRIPTORS.duplicationPercentage, value: total.percentage },
    { descriptor: DUPLICATION_DESCRIPTORS.totalSources, value: total.sources },
    { descriptor: DUPLICATION_DESCRIPTORS.totalLines, value: total.lines },
  ];
}

function buildFiles(
  formats: Readonly<Record<string, JscpdFormatEntry>>,
): readonly FileMeasurement[] {
  const files: FileMeasurement[] = [];

  for (const format of Object.values(formats)) {
    for (const [filePath, stats] of Object.entries(format.sources)) {
      files.push({
        filePath,
        metrics: [
          { descriptor: FILE_DESCRIPTORS.fileClones, value: stats.clones },
          { descriptor: FILE_DESCRIPTORS.fileDuplicatedLines, value: stats.duplicatedLines },
          { descriptor: FILE_DESCRIPTORS.fileDuplicationPercentage, value: stats.percentage },
        ],
      });
    }
  }

  return files;
}

/**
 * Parse a jscpd JSON report into a CodePulse AxisMeasurement.
 */
export function parseJscpdReport(report: JscpdReport): AxisMeasurement {
  return {
    axisId: "duplication",
    summary: buildSummary(report.statistics.total),
    files: buildFiles(report.statistics.formats),
  };
}

// ---------------------------------------------------------------------------
// Default exec and read functions
// ---------------------------------------------------------------------------

async function defaultExecFn(args: readonly string[]): Promise<JscpdExecResult> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  try {
    const { stdout } = await execFileAsync("npx", ["jscpd", ...args]);
    return { ok: true, stdout };
  } catch (cause: unknown) {
    const message =
      cause instanceof Error ? cause.message : String(cause);
    return { ok: false, error: message };
  }
}

async function defaultReadFn(path: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  return readFile(path, "utf-8");
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
 * Create a jscpd adapter instance.
 *
 * @param execFn - Optional injectable exec function for testing.
 * @param readFn - Optional injectable read function for testing.
 */
export function createJscpdAdapter(
  execFn?: JscpdExecFn,
  readFn?: JscpdReadFn,
): ToolAdapter {
  const exec = execFn ?? defaultExecFn;
  const read = readFn ?? defaultReadFn;

  return {
    id: "jscpd",
    toolName: "jscpd",
    supportedAxes: ["duplication"] as const,

    async checkAvailability(): Promise<ToolAvailability> {
      const result = await exec(["--version"]);
      if (!result.ok) {
        return { available: false, reason: `jscpd is not available: ${result.error}` };
      }
      return { available: true, version: parseVersion(result.stdout) };
    },

    async measure(
      targetPath: string,
      _axisId: AxisId,
    ): Promise<Result<AxisMeasurement, AdapterError>> {
      // Create a temporary output directory path using the target path hash
      const { createHash } = await import("node:crypto");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");

      const hash = createHash("md5").update(targetPath).digest("hex").slice(0, 8);
      const outputDir = join(tmpdir(), `codepulse-jscpd-${hash}`);

      const execResult = await exec([
        "--reporters", "json",
        "--output", outputDir,
        targetPath,
      ]);

      if (!execResult.ok) {
        return err({
          adapterId: "jscpd",
          message: `jscpd execution failed: ${execResult.error}`,
        });
      }

      const reportPath = join(outputDir, "jscpd-report.json");
      let reportContent: string;
      try {
        reportContent = await read(reportPath);
      } catch (cause: unknown) {
        return err({
          adapterId: "jscpd",
          message: `Failed to read jscpd report file`,
          cause,
        });
      }

      let parsed: JscpdReport;
      try {
        parsed = JSON.parse(reportContent) as JscpdReport;
      } catch (cause: unknown) {
        return err({
          adapterId: "jscpd",
          message: `Failed to parse jscpd JSON report`,
          cause,
        });
      }

      return ok(parseJscpdReport(parsed));
    },
  };
}
