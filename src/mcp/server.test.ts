/**
 * Tests for the MCP server module.
 *
 * The MCP server exposes CodePulse measurement capabilities to AI agents
 * via the Model Context Protocol (stdio transport). It registers a "measure"
 * tool that runs the orchestration pipeline and returns formatted results.
 *
 * These tests verify:
 *   - Server creation and tool registration
 *   - The measure tool invokes orchestration and returns results
 *   - Error handling when measurement fails
 *   - Axis filtering via tool arguments
 */

import { describe, it, expect } from "vitest";
import {
  createMcpServer,
  handleMeasureCall,
  type McpServerDeps,
} from "./server.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import type { AdapterRegistry } from "../adapter/registry.js";
import type { AxisId } from "../types/axis.js";
import type { AxisMeasurement } from "../types/measurement.js";
import type { Result } from "../types/result.js";
import type { AdapterError, ToolAdapter, ToolAvailability } from "../adapter/adapter.js";

function makeStubAdapter(
  id: string,
  axes: AxisId[],
  measurement: AxisMeasurement,
): ToolAdapter {
  return {
    id,
    toolName: id,
    supportedAxes: axes,
    async checkAvailability(): Promise<ToolAvailability> {
      return { available: true, version: "1.0.0" };
    },
    async measure(
      _targetPath: string,
      axisId: AxisId,
    ): Promise<Result<AxisMeasurement, AdapterError>> {
      return { ok: true, value: { ...measurement, axisId } };
    },
  };
}

function makeStubRegistry(adapters: ToolAdapter[]): AdapterRegistry {
  return {
    getAdaptersForAxis(axisId: AxisId): readonly ToolAdapter[] {
      return adapters.filter((a) => a.supportedAxes.includes(axisId));
    },
    getAdapter(id: string): ToolAdapter | undefined {
      return adapters.find((a) => a.id === id);
    },
    getRegisteredIds(): readonly string[] {
      return adapters.map((a) => a.id);
    },
    register(_adapter: ToolAdapter): void {
      // no-op
    },
  } as AdapterRegistry;
}

function makeSizeMeasurement(): AxisMeasurement {
  return {
    axisId: "size",
    summary: [
      {
        descriptor: {
          id: "total-lines",
          name: "Total Lines",
          unit: "lines",
          min: 0,
          max: null,
          interpretation: "Total number of lines",
        },
        value: 100,
      },
    ],
    files: [],
  };
}

function makeDeps(overrides?: Partial<McpServerDeps>): McpServerDeps {
  const sizeAdapter = makeStubAdapter("scc", ["size", "complexity"], makeSizeMeasurement());
  return {
    registry: makeStubRegistry([sizeAdapter]),
    timestampFn: () => "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createMcpServer
// ---------------------------------------------------------------------------

describe("createMcpServer", () => {
  it("creates an McpServer instance", () => {
    const deps = makeDeps();
    const server = createMcpServer(deps);
    expect(server).toBeDefined();
    expect(server.server).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// handleMeasureCall — the core tool handler logic
// ---------------------------------------------------------------------------

describe("handleMeasureCall", () => {
  it("runs measurement and returns JSON-formatted text content", async () => {
    const deps = makeDeps();
    const result = await handleMeasureCall(
      { targetPath: "/project/src" },
      deps,
    );

    expect(result.isError).not.toBe(true);
    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.content[0]!.type).toBe("text");

    // The text content should be valid JSON
    const text = result.content[0]!.text;
    const parsed = JSON.parse(text);
    expect(parsed.targetPath).toBe("/project/src");
    expect(parsed.timestamp).toBe("2025-01-01T00:00:00.000Z");
    expect(parsed.axes).toBeDefined();
    expect(parsed.axes.length).toBeGreaterThan(0);
  });

  it("filters to specified axes when provided", async () => {
    const deps = makeDeps();
    const result = await handleMeasureCall(
      { targetPath: "/project/src", axes: ["size"] },
      deps,
    );

    expect(result.isError).not.toBe(true);
    const parsed = JSON.parse(result.content[0]!.text);
    // Should only have the size axis
    const axisIds = parsed.axes.map((a: AxisMeasurement) => a.axisId);
    expect(axisIds).toContain("size");
  });

  it("returns an error when measurement fails entirely", async () => {
    const emptyRegistry = makeStubRegistry([]);
    const deps = makeDeps({ registry: emptyRegistry });
    const result = await handleMeasureCall(
      { targetPath: "/project/src", axes: ["size"] },
      deps,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toBeTruthy();
  });

  it("uses the JSON formatter for output", async () => {
    const deps = makeDeps();
    const result = await handleMeasureCall(
      { targetPath: "/project/src" },
      deps,
    );

    // JSON output should include metric metadata (the full descriptor)
    const parsed = JSON.parse(result.content[0]!.text);
    const firstMetric = parsed.axes[0]?.summary?.[0];
    expect(firstMetric?.descriptor).toBeDefined();
    expect(firstMetric?.descriptor.unit).toBeDefined();
    expect(firstMetric?.descriptor.interpretation).toBeDefined();
  });

  it("includes targetPath in the report", async () => {
    const deps = makeDeps();
    const result = await handleMeasureCall(
      { targetPath: "/some/other/path" },
      deps,
    );

    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.targetPath).toBe("/some/other/path");
  });

  it("produces deterministic output for identical input", async () => {
    const deps = makeDeps();
    const result1 = await handleMeasureCall(
      { targetPath: "/project/src" },
      deps,
    );
    const result2 = await handleMeasureCall(
      { targetPath: "/project/src" },
      deps,
    );

    expect(result1).toEqual(result2);
  });
});
