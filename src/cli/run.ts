/**
 * CLI runner — the top-level entry point that wires everything together.
 *
 * Responsibilities:
 *   1. Parse arguments into a MeasurementConfig
 *   2. Call the orchestrator with the provided registry
 *   3. Format the result using the appropriate formatter
 *   4. Write output to stdout or a file
 *
 * Dependencies: All layers (Types, Adapter, Orchestration, Formatter).
 */

import type { AdapterRegistry } from "../adapter/registry.js";
import type { OutputFormat } from "../types/config.js";
import type { MeasurementReport } from "../types/measurement.js";
import type { Formatter, FormatterOptions } from "../formatter/formatter.js";
import { measure } from "../orchestration/orchestrator.js";
import { formatJson } from "../formatter/json.js";
import { formatTerminalCompact } from "../formatter/terminal-compact.js";
import { formatTerminalRich } from "../formatter/terminal-rich.js";
import { formatHtml } from "../formatter/html.js";
import { parseArgs } from "./parse-args.js";

/**
 * Result of checking target path status.
 */
export interface StatResult {
  readonly isDirectory: boolean;
}

/**
 * Injectable dependencies for testability.
 * Production code provides real I/O; tests provide mocks.
 */
export interface CliDeps {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly registry: AdapterRegistry;
  readonly timestampFn?: () => string;
  readonly writeFn?: (path: string, content: string) => Promise<void>;
  readonly startMcpServer?: () => Promise<void>;
  readonly statFn?: (path: string) => Promise<StatResult>;
  /** When true, suppresses ANSI color codes (mirrors the NO_COLOR env var). */
  readonly noColorEnv?: boolean;
}

function selectFormatter(format: OutputFormat): Formatter {
  switch (format) {
    case "json":
      return formatJson;
    case "terminal-compact":
      return formatTerminalCompact;
    case "terminal-rich":
      return formatTerminalRich;
    case "html":
      return formatHtml;
  }
}

/**
 * Returns a new report with each axis's files array truncated to at most `n` entries.
 * When truncation occurs, sets fileTotalCount so consumers know the full count.
 */
function limitFiles(report: MeasurementReport, n: number): MeasurementReport {
  return {
    ...report,
    axes: report.axes.map((axis) => {
      if (axis.files.length <= n) {
        return axis;
      }
      return {
        ...axis,
        files: axis.files.slice(0, n),
        fileTotalCount: axis.files.length,
      };
    }),
  };
}

/**
 * Run the CLI with the given argument array and dependencies.
 * Returns a process exit code (0 = success, 1 = error).
 */
export async function run(
  argv: readonly string[],
  deps: CliDeps,
): Promise<number> {
  const parseResult = parseArgs(argv);

  if (!parseResult.ok) {
    const { kind, message } = parseResult.error;
    if (kind === "help" || kind === "version" || kind === "list-axes") {
      deps.stdout(message);
      return 0;
    }
    if (kind === "mcp") {
      if (deps.startMcpServer === undefined) {
        deps.stderr("MCP server is not available");
        return 1;
      }
      await deps.startMcpServer();
      return 0;
    }
    // Parsing error.
    deps.stderr(message);
    return 1;
  }

  const config = parseResult.value;

  // Validate target path before running adapters.
  if (deps.statFn !== undefined) {
    try {
      const stat = await deps.statFn(config.targetPath);
      if (!stat.isDirectory) {
        deps.stderr(`Target path "${config.targetPath}" is not a directory`);
        return 1;
      }
    } catch {
      deps.stderr(`Target path "${config.targetPath}" does not exist`);
      return 1;
    }
  }

  const options = deps.timestampFn !== undefined
    ? { timestampFn: deps.timestampFn }
    : undefined;

  const measureResult = await measure(config, deps.registry, options);

  if (!measureResult.ok) {
    deps.stderr(measureResult.error.message);
    return 1;
  }

  const rawReport: MeasurementReport = measureResult.value;
  const report: MeasurementReport = config.topN !== undefined
    ? limitFiles(rawReport, config.topN)
    : rawReport;
  const formatter = selectFormatter(config.outputFormat);
  const noColor = config.noColor || deps.noColorEnv === true;
  const formatterOptions: FormatterOptions = { noColor };
  const output = formatter(report, formatterOptions);

  if (config.outputPath !== undefined && deps.writeFn !== undefined) {
    try {
      await deps.writeFn(config.outputPath, output);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : String(cause);
      deps.stderr(`Failed to write report: ${message}`);
      return 1;
    }
    deps.stdout(`Report written to ${config.outputPath}`);
  } else {
    deps.stdout(output);
  }

  return 0;
}
