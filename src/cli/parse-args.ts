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

/**
 * Non-config results from parsing: help request, version request, or error.
 */
export interface ParseError {
  readonly kind: "error" | "help" | "version" | "mcp";
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
  "--help",
  "--version",
  "--mcp",
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
  // Check for --help and --version first (they short-circuit).
  if (argv.includes("--help")) {
    return {
      ok: false,
      error: { kind: "help", message: helpText() },
    };
  }

  if (argv.includes("--version")) {
    return {
      ok: false,
      error: { kind: "version", message: "codepulse 0.1.0" },
    };
  }

  if (argv.includes("--mcp")) {
    return {
      ok: false,
      error: { kind: "mcp", message: "Starting MCP server" },
    };
  }

  let format: OutputFormat = "terminal-compact";
  const axes: AxisId[] = [];
  let outputPath: string | undefined;
  let targetPath: string | undefined;

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;

    if (arg === "--format") {
      const value = argv[i + 1];
      if (value === undefined) {
        return {
          ok: false,
          error: { kind: "error", message: "--format requires a value" },
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
      i += 2;
      continue;
    }

    if (arg === "--axis") {
      const value = argv[i + 1];
      if (value === undefined) {
        return {
          ok: false,
          error: { kind: "error", message: "--axis requires a value" },
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
      const value = argv[i + 1];
      if (value === undefined) {
        return {
          ok: false,
          error: { kind: "error", message: "--output requires a value" },
        };
      }
      outputPath = value;
      i += 2;
      continue;
    }

    if (arg.startsWith("--")) {
      if (!KNOWN_FLAGS.has(arg)) {
        return {
          ok: false,
          error: {
            kind: "error",
            message: `Unknown flag "${arg}"`,
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

  const config: MeasurementConfig = {
    targetPath,
    axes,
    outputFormat: format,
    outputPath,
    thresholds: [],
  };

  return { ok: true, value: config };
}

function helpText(): string {
  return [
    "Usage: codepulse [options] <target-path>",
    "",
    "Measure the internal quality of a codebase.",
    "",
    "Options:",
    "  --format <format>   Output format (terminal-compact, terminal-rich, json, html)",
    "  --axis <axis>       Measurement axis to run (repeatable)",
    "  --output <path>     Write output to file instead of stdout",
    "  --mcp               Start as MCP server (stdio transport)",
    "  --help              Show this help message",
    "  --version           Show version number",
    "",
    "Axes:",
    ...[...AXES.values()].map(
      (a) => `  ${a.id.padEnd(20)} ${a.description}`,
    ),
  ].join("\n");
}
