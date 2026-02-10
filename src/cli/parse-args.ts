/**
 * CLI argument parser.
 *
 * Translates a process.argv-style string array into a MeasurementConfig
 * or a structured error. Uses only Node.js built-ins — no external
 * argument-parsing libraries.
 *
 * Dependencies: Types layer only.
 */

import type { AxisId } from "../types/axis.js";
import type { OutputFormat, MeasurementConfig } from "../types/config.js";
import { AXES } from "../types/axis.js";
import { VERSION } from "../version.js";

/**
 * Non-config results from parsing: help request, version request, or error.
 */
export interface ParseError {
  readonly kind: "error" | "help" | "version" | "mcp" | "list-axes";
  readonly message: string;
}

export type ParseResult =
  | { readonly ok: true; readonly value: MeasurementConfig }
  | { readonly ok: false; readonly error: ParseError };

const VALID_FORMATS: ReadonlySet<string> = new Set([
  "terminal-compact",
  "terminal-rich",
  "json",
  "html",
]);

const KNOWN_FLAGS: ReadonlySet<string> = new Set([
  "--format",
  "--axis",
  "--output",
  "--top",
  "--sort",
  "--help",
  "--version",
  "--mcp",
  "--list-axes",
  "--no-color",
]);

/**
 * Maps short flag aliases to their long equivalents.
 */
const SHORT_TO_LONG: ReadonlyMap<string, string> = new Map([
  ["-f", "--format"],
  ["-a", "--axis"],
  ["-o", "--output"],
  ["-s", "--sort"],
  ["-h", "--help"],
  ["-V", "--version"],
  ["-n", "--top"],
]);

/**
 * Parse a CLI argument array into a MeasurementConfig.
 *
 * Expected usage:
 *   codepulse [options] <target-path>
 *
 * Options:
 *   --format <format>   Output format (terminal-compact, terminal-rich, json, html)
 *   --axis <axis>       Measurement axis to run (repeatable)
 *   --output <path>     Write output to file instead of stdout
 *   --help              Show help text
 *   --version           Show version
 */
export function parseArgs(argv: readonly string[]): ParseResult {
  // Expand short flags to their long equivalents before parsing.
  const expandedArgv = argv.map((arg) => SHORT_TO_LONG.get(arg) ?? arg);

  // Check for --help and --version first (they short-circuit).
  if (expandedArgv.includes("--help")) {
    return {
      ok: false,
      error: { kind: "help", message: helpText() },
    };
  }

  if (expandedArgv.includes("--version")) {
    return {
      ok: false,
      error: { kind: "version", message: `codepulse ${VERSION}` },
    };
  }

  if (expandedArgv.includes("--mcp")) {
    return {
      ok: false,
      error: { kind: "mcp", message: "Starting MCP server" },
    };
  }

  if (expandedArgv.includes("--list-axes")) {
    return {
      ok: false,
      error: { kind: "list-axes", message: listAxesText() },
    };
  }

  let format: OutputFormat = "terminal-compact";
  let formatExplicit = false;
  const axes: AxisId[] = [];
  let outputPath: string | undefined;
  let targetPath: string | undefined;
  let noColor = false;
  let topN: number | undefined;
  let sortMetric: string | undefined;

  let i = 0;
  while (i < expandedArgv.length) {
    const arg = expandedArgv[i]!;
    const originalArg = argv[i]!;

    if (arg === "--format") {
      const value = expandedArgv[i + 1];
      if (value === undefined) {
        return {
          ok: false,
          error: { kind: "error", message: `${originalArg} requires a value` },
        };
      }
      if (!VALID_FORMATS.has(value)) {
        return {
          ok: false,
          error: {
            kind: "error",
            message: `Unknown format "${value}". Valid formats: ${[...VALID_FORMATS].join(", ")}`,
          },
        };
      }
      format = value as OutputFormat;
      formatExplicit = true;
      i += 2;
      continue;
    }

    if (arg === "--axis") {
      const value = expandedArgv[i + 1];
      if (value === undefined) {
        return {
          ok: false,
          error: { kind: "error", message: `${originalArg} requires a value` },
        };
      }
      if (!AXES.has(value as AxisId)) {
        return {
          ok: false,
          error: {
            kind: "error",
            message: `Unknown axis "${value}". Valid axes: ${[...AXES.keys()].join(", ")}`,
          },
        };
      }
      const axisId = value as AxisId;
      if (!axes.includes(axisId)) {
        axes.push(axisId);
      }
      i += 2;
      continue;
    }

    if (arg === "--output") {
      const value = expandedArgv[i + 1];
      if (value === undefined) {
        return {
          ok: false,
          error: { kind: "error", message: `${originalArg} requires a value` },
        };
      }
      outputPath = value;
      i += 2;
      continue;
    }

    if (arg === "--no-color") {
      noColor = true;
      i += 1;
      continue;
    }

    if (arg === "--top") {
      const value = expandedArgv[i + 1];
      if (value === undefined) {
        return {
          ok: false,
          error: { kind: "error", message: `${originalArg} requires a value` },
        };
      }
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1) {
        return {
          ok: false,
          error: {
            kind: "error",
            message: `--top requires a positive integer, got "${value}"`,
          },
        };
      }
      topN = parsed;
      i += 2;
      continue;
    }

    if (arg === "--sort") {
      const value = expandedArgv[i + 1];
      if (value === undefined) {
        return {
          ok: false,
          error: { kind: "error", message: `${originalArg} requires a value` },
        };
      }
      sortMetric = value;
      i += 2;
      continue;
    }

    if (arg.startsWith("-")) {
      if (!KNOWN_FLAGS.has(arg)) {
        return {
          ok: false,
          error: {
            kind: "error",
            message: `Unknown flag "${originalArg}"`,
          },
        };
      }
      i += 1;
      continue;
    }

    // Positional argument: target path (first positional wins).
    if (targetPath === undefined) {
      targetPath = arg;
    }
    i += 1;
  }

  if (targetPath === undefined) {
    return {
      ok: false,
      error: {
        kind: "error",
        message: "Missing target path. Usage: codepulse [options] <target-path>",
      },
    };
  }

  // Infer output format from --output file extension when --format was not explicit.
  if (!formatExplicit && outputPath !== undefined) {
    const inferred = inferFormatFromExtension(outputPath);
    if (inferred !== undefined) {
      format = inferred;
    }
  }

  const config: MeasurementConfig = {
    targetPath,
    axes,
    outputFormat: format,
    outputPath,
    thresholds: [],
    noColor,
    topN,
    sortMetric,
  };

  return { ok: true, value: config };
}

const EXTENSION_FORMAT_MAP: ReadonlyMap<string, OutputFormat> = new Map([
  [".json", "json"],
  [".html", "html"],
  [".htm", "html"],
]);

/**
 * Infers an output format from a file path's extension.
 * Returns undefined if the extension is not recognized.
 */
function inferFormatFromExtension(filePath: string): OutputFormat | undefined {
  const dotIndex = filePath.lastIndexOf(".");
  if (dotIndex === -1) {
    return undefined;
  }
  const ext = filePath.slice(dotIndex).toLowerCase();
  return EXTENSION_FORMAT_MAP.get(ext);
}

function listAxesText(): string {
  return [
    "Available measurement axes:",
    "",
    ...[...AXES.values()].map(
      (a) => `  ${a.id.padEnd(20)} ${a.description}`,
    ),
  ].join("\n");
}

function helpText(): string {
  return [
    "Usage: codepulse [options] <target-path>",
    "",
    "Measure the internal quality of a codebase.",
    "",
    "Options:",
    "  -f, --format <format>   Output format (terminal-compact, terminal-rich, json, html)",
    "  -a, --axis <axis>       Measurement axis to run (repeatable)",
    "  -o, --output <path>     Write output to file instead of stdout",
    "                          (format is inferred from .json/.html extension if --format is omitted)",
    "  -n, --top <N>           Limit per-axis file-level results to the top N entries",
    "  -s, --sort <metric-id>  Sort file-level results by the named metric (descending)",
    "      --no-color          Disable ANSI color codes in terminal output (also honors NO_COLOR env var)",
    "      --mcp               Start as MCP server (stdio transport)",
    "      --list-axes         List available measurement axes",
    "  -h, --help              Show this help message",
    "  -V, --version           Show version number",
    "",
    "Axes:",
    ...[...AXES.values()].map(
      (a) => `  ${a.id.padEnd(20)} ${a.description}`,
    ),
  ].join("\n");
}
