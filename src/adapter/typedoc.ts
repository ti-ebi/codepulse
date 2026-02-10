/**
 * typedoc adapter.
 *
 * Integrates the typedoc external tool (https://typedoc.org/) with CodePulse.
 * typedoc analyzes TypeScript/JavaScript documentation comments and produces
 * a structured representation of documented symbols.
 *
 * This adapter supports one measurement axis:
 *   - "documentation" — documentation coverage of exported symbols
 *
 * The adapter follows the Three-Line pattern:
 *   1. Invoke typedoc --json stdout <target>
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
// typedoc JSON output types
// ---------------------------------------------------------------------------

/**
 * A comment summary part from typedoc's JSON output.
 */
export interface TypedocCommentPart {
  readonly kind: string;
  readonly text: string;
}

/**
 * A comment block from typedoc's JSON output.
 */
export interface TypedocComment {
  readonly summary: readonly TypedocCommentPart[];
}

/**
 * A single documented/undocumented symbol from typedoc's JSON output.
 */
export interface TypedocChild {
  readonly id: number;
  readonly name: string;
  readonly kind: number;
  readonly kindString: string;
  readonly comment?: TypedocComment;
}

/**
 * Top-level typedoc JSON output structure.
 */
export interface TypedocOutput {
  readonly children?: readonly TypedocChild[];
}

// ---------------------------------------------------------------------------
// Exec function type — injectable for testing
// ---------------------------------------------------------------------------

export type TypedocExecResult =
  | { readonly ok: true; readonly stdout: string }
  | { readonly ok: false; readonly error: string };

export type TypedocExecFn = (args: readonly string[]) => Promise<TypedocExecResult>;

// ---------------------------------------------------------------------------
// Metric descriptors
// ---------------------------------------------------------------------------

const SUMMARY_DESCRIPTORS = {
  totalSymbols: {
    id: "total-symbols",
    name: "Total Symbols",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Total number of exported symbols analyzed for documentation",
  },
  documentedSymbols: {
    id: "documented-symbols",
    name: "Documented Symbols",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Number of exported symbols that have documentation comments",
  },
  undocumentedSymbols: {
    id: "undocumented-symbols",
    name: "Undocumented Symbols",
    unit: "count",
    min: 0,
    max: null,
    interpretation: "Number of exported symbols that lack documentation comments",
  },
  documentationCoverage: {
    id: "documentation-coverage",
    name: "Documentation Coverage",
    unit: "percent",
    min: 0,
    max: 100,
    interpretation: "Percentage of exported symbols that have documentation comments",
  },
} as const satisfies Record<string, MetricDescriptor>;

const FILE_DESCRIPTORS = {
  hasDocumentation: {
    id: "has-documentation",
    name: "Has Documentation",
    unit: "boolean",
    min: 0,
    max: 1,
    interpretation: "Whether this symbol has a documentation comment (1 = yes, 0 = no)",
  },
  symbolKind: {
    id: "symbol-kind",
    name: "Symbol Kind",
    unit: "code",
    min: 0,
    max: null,
    interpretation: "Numeric kind code from typedoc representing the symbol type (e.g., function, class, interface)",
  },
} as const satisfies Record<string, MetricDescriptor>;

// ---------------------------------------------------------------------------
// Parsing — transforms typedoc output into AxisMeasurement
// ---------------------------------------------------------------------------

function isDocumented(child: TypedocChild): boolean {
  return child.comment !== undefined && child.comment.summary.length > 0;
}

function buildSummary(children: readonly TypedocChild[]): readonly MetricValue[] {
  const totalSymbols = children.length;
  const documentedSymbols = children.filter(isDocumented).length;
  const undocumentedSymbols = totalSymbols - documentedSymbols;
  const coverage = totalSymbols > 0 ? (documentedSymbols / totalSymbols) * 100 : 100;

  return [
    { descriptor: SUMMARY_DESCRIPTORS.totalSymbols, value: totalSymbols },
    { descriptor: SUMMARY_DESCRIPTORS.documentedSymbols, value: documentedSymbols },
    { descriptor: SUMMARY_DESCRIPTORS.undocumentedSymbols, value: undocumentedSymbols },
    { descriptor: SUMMARY_DESCRIPTORS.documentationCoverage, value: coverage },
  ];
}

function buildFiles(children: readonly TypedocChild[]): readonly FileMeasurement[] {
  const sorted = [...children].sort((a, b) => a.name.localeCompare(b.name));

  return sorted.map((child) => ({
    filePath: child.name,
    metrics: [
      { descriptor: FILE_DESCRIPTORS.hasDocumentation, value: isDocumented(child) ? 1 : 0 },
      { descriptor: FILE_DESCRIPTORS.symbolKind, value: child.kind },
    ],
  }));
}

/**
 * Parse typedoc JSON output into a CodePulse AxisMeasurement.
 */
export function parseTypedocOutput(output: TypedocOutput): AxisMeasurement {
  const children = output.children ?? [];

  return {
    axisId: "documentation",
    summary: buildSummary(children),
    files: buildFiles(children),
  };
}

// ---------------------------------------------------------------------------
// Default exec function — invokes typedoc via npx
// ---------------------------------------------------------------------------

async function defaultExecFn(args: readonly string[]): Promise<TypedocExecResult> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  try {
    const { stdout } = await execFileAsync("npx", ["typedoc", ...args]);
    return { ok: true, stdout };
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
 * Create a typedoc adapter instance.
 *
 * @param execFn - Optional injectable exec function for testing.
 */
export function createTypedocAdapter(execFn?: TypedocExecFn): ToolAdapter {
  const exec = execFn ?? defaultExecFn;

  return {
    id: "typedoc",
    toolName: "TypeDoc",
    supportedAxes: ["documentation"] as const,

    async checkAvailability(): Promise<ToolAvailability> {
      const result = await exec(["--version"]);
      if (!result.ok) {
        return { available: false, reason: `TypeDoc is not available: ${result.error}` };
      }
      return { available: true, version: parseVersion(result.stdout) };
    },

    async measure(
      targetPath: string,
      _axisId: AxisId,
    ): Promise<Result<AxisMeasurement, AdapterError>> {
      // Step 1: Invoke typedoc with JSON output to stdout
      const result = await exec(["--json", "stdout", targetPath]);

      if (!result.ok) {
        return err({
          adapterId: "typedoc",
          message: `typedoc execution failed: ${result.error}`,
        });
      }

      // Step 2: Parse the JSON output
      let output: TypedocOutput;
      try {
        output = JSON.parse(result.stdout) as TypedocOutput;
      } catch (cause: unknown) {
        return err({
          adapterId: "typedoc",
          message: `Failed to parse typedoc JSON output`,
          cause,
        });
      }

      // Step 3: Map to CodePulse schema
      return ok(parseTypedocOutput(output));
    },
  };
}
