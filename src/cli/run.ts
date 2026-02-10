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
import type { Formatter } from "../formatter/formatter.js";
import { measure } from "../orchestration/orchestrator.js";
import { formatJson } from "../formatter/json.js";
import { formatTerminalCompact } from "../formatter/terminal-compact.js";
import { formatTerminalRich } from "../formatter/terminal-rich.js";
import { parseArgs } from "./parse-args.js";

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
      // HTML formatter not yet implemented; fall back to JSON.
      return formatJson;
  }
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
    if (kind === "help" || kind === "version") {
      deps.stdout(message);
      return 0;
    }
    // Parsing error.
    deps.stderr(message);
    return 1;
  }

  const config = parseResult.value;

  const options = deps.timestampFn !== undefined
    ? { timestampFn: deps.timestampFn }
    : undefined;

  const measureResult = await measure(config, deps.registry, options);

  if (!measureResult.ok) {
    deps.stderr(measureResult.error.message);
    return 1;
  }

  const report: MeasurementReport = measureResult.value;
  const formatter = selectFormatter(config.outputFormat);
  const output = formatter(report);

  if (config.outputPath !== undefined && deps.writeFn !== undefined) {
    await deps.writeFn(config.outputPath, output);
    deps.stdout(`Report written to ${config.outputPath}`);
  } else {
    deps.stdout(output);
  }

  return 0;
}
