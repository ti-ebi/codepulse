/**
 * MCP server for CodePulse.
 *
 * Exposes CodePulse measurement capabilities to AI agents via the
 * Model Context Protocol (stdio transport). The server registers a
 * "measure" tool that runs the orchestration pipeline and returns
 * the measurement report as structured JSON text.
 *
 * Dependencies: Types, Adapter, Orchestration, Formatter (same level as CLI).
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AXES } from "../types/axis.js";
import type { AxisId } from "../types/axis.js";
import type { MeasurementConfig } from "../types/config.js";
import type { AdapterRegistry } from "../adapter/registry.js";
import { measure } from "../orchestration/orchestrator.js";
import { formatJson } from "../formatter/json.js";
import { VERSION } from "../version.js";

/**
 * Injectable dependencies for the MCP server.
 */
export interface McpServerDeps {
  readonly registry: AdapterRegistry;
  readonly timestampFn?: () => string;
}

/**
 * The shape returned by the measure tool handler.
 */
export interface MeasureToolResult {
  readonly content: { type: "text"; text: string }[];
  readonly isError?: boolean;
}

/**
 * Arguments accepted by the measure tool.
 */
interface MeasureArgs {
  readonly targetPath: string;
  readonly axes?: readonly string[] | undefined;
}

/**
 * Core logic for the measure tool call, extracted for testability.
 *
 * Runs the orchestration pipeline with the given arguments and returns
 * the result formatted as JSON text content suitable for MCP responses.
 */
export async function handleMeasureCall(
  args: MeasureArgs,
  deps: McpServerDeps,
): Promise<MeasureToolResult> {
  const axisIds: AxisId[] = args.axes
    ? (args.axes.filter((a) => AXES.has(a as AxisId)) as AxisId[])
    : [];

  const config: MeasurementConfig = {
    targetPath: args.targetPath,
    axes: axisIds,
    outputFormat: "json",
    thresholds: [],
    noColor: false,
  };

  const options = deps.timestampFn !== undefined
    ? { timestampFn: deps.timestampFn }
    : undefined;

  const result = await measure(config, deps.registry, options);

  if (!result.ok) {
    return {
      content: [{ type: "text", text: result.error.message }],
      isError: true,
    };
  }

  const jsonOutput = formatJson(result.value);

  return {
    content: [{ type: "text", text: jsonOutput }],
  };
}

/**
 * Create a configured McpServer instance with the "measure" tool registered.
 *
 * The caller is responsible for connecting the server to a transport
 * (e.g., StdioServerTransport) and starting it.
 */
export function createMcpServer(deps: McpServerDeps): McpServer {
  const server = new McpServer({
    name: "codepulse",
    version: VERSION,
  });

  const axisIds = [...AXES.keys()];

  server.registerTool(
    "measure",
    {
      title: "Measure Code Quality",
      description:
        "Measure the internal quality of a codebase across multiple dimensions " +
        "(complexity, duplication, dead code, size, dependency health, etc.). " +
        "Returns a structured JSON report with metric metadata.",
      inputSchema: {
        targetPath: z
          .string()
          .describe("Absolute path to the directory to measure"),
        axes: z
          .array(z.enum(axisIds as [string, ...string[]]))
          .optional()
          .describe(
            "Measurement axes to run. If omitted, all available axes are measured. " +
            `Valid values: ${axisIds.join(", ")}`,
          ),
      },
    },
    async (args) => {
      const result = await handleMeasureCall(
        { targetPath: args.targetPath, axes: args.axes },
        deps,
      );
      return {
        content: result.content,
        isError: result.isError,
      } as { content: { type: "text"; text: string }[]; isError?: boolean };
    },
  );

  return server;
}
