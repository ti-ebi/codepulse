import { describe, it, expect } from "vitest";
import { measure } from "./orchestrator.js";
import { AdapterRegistry } from "../adapter/registry.js";
import type { ToolAdapter, ToolAvailability, AdapterError } from "../adapter/adapter.js";
import type { AxisId } from "../types/axis.js";
import type { AxisMeasurement, MetricValue } from "../types/measurement.js";
import type { MeasurementConfig } from "../types/config.js";
import type { Result } from "../types/result.js";

const FIXED_TIMESTAMP = "2025-01-01T00:00:00.000Z";
const fixedTimestampFn = (): string => FIXED_TIMESTAMP;

function createConfig(overrides: Partial<MeasurementConfig> = {}): MeasurementConfig {
  return {
    targetPath: "/tmp/test-project",
    axes: [],
    outputFormat: "json",
    thresholds: [],
    noColor: false,
    ...overrides,
  };
}

function createStubAdapter(
  id: string,
  supportedAxes: AxisId[],
  options: {
    available?: boolean;
    version?: string;
    unavailableReason?: string;
    measureResult?: (axisId: AxisId) => Result<AxisMeasurement, AdapterError>;
  } = {},
): ToolAdapter {
  const {
    available = true,
    version = "1.0.0",
    unavailableReason = "not installed",
  } = options;

  return {
    id,
    toolName: `stub-${id}`,
    supportedAxes,
    async checkAvailability(): Promise<ToolAvailability> {
      if (available) {
        return { available: true, version };
      }
      return { available: false, reason: unavailableReason };
    },
    async measure(
      _targetPath: string,
      axisId: AxisId,
    ): Promise<Result<AxisMeasurement, AdapterError>> {
      if (options.measureResult) {
        return options.measureResult(axisId);
      }
      return {
        ok: true,
        value: {
          axisId,
          summary: [],
          files: [],
        },
      };
    },
  };
}

function createMetricValue(id: string, value: number): MetricValue {
  return {
    descriptor: {
      id,
      name: id,
      unit: "count",
      min: 0,
      max: null,
      interpretation: "test metric",
    },
    value,
  };
}

describe("measure", () => {
  it("returns a report with results from a single adapter", async () => {
    const registry = new AdapterRegistry();
    registry.register(createStubAdapter("scc", ["complexity"]));
    const config = createConfig({ axes: ["complexity"] });

    const result = await measure(config, registry, { timestampFn: fixedTimestampFn });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.targetPath).toBe("/tmp/test-project");
      expect(result.value.timestamp).toBe(FIXED_TIMESTAMP);
      expect(result.value.axes).toHaveLength(1);
      expect(result.value.axes[0]?.axisId).toBe("complexity");
    }
  });

  it("returns results from multiple adapters for different axes", async () => {
    const registry = new AdapterRegistry();
    registry.register(createStubAdapter("scc", ["complexity", "size"]));
    registry.register(createStubAdapter("jscpd", ["duplication"]));
    const config = createConfig({ axes: ["complexity", "duplication"] });

    const result = await measure(config, registry, { timestampFn: fixedTimestampFn });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.axes).toHaveLength(2);
      const axisIds = result.value.axes.map((a) => a.axisId);
      expect(axisIds).toContain("complexity");
      expect(axisIds).toContain("duplication");
    }
  });

  it("measures all known axes when config.axes is empty", async () => {
    const registry = new AdapterRegistry();
    registry.register(createStubAdapter("scc", ["complexity", "size"]));
    registry.register(createStubAdapter("jscpd", ["duplication"]));
    const config = createConfig({ axes: [] });

    const result = await measure(config, registry, { timestampFn: fixedTimestampFn });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Only axes with available adapters should appear
      expect(result.value.axes).toHaveLength(3);
      const axisIds = result.value.axes.map((a) => a.axisId);
      expect(axisIds).toContain("complexity");
      expect(axisIds).toContain("size");
      expect(axisIds).toContain("duplication");
    }
  });

  it("skips axes with no registered adapter (partial results)", async () => {
    const registry = new AdapterRegistry();
    registry.register(createStubAdapter("scc", ["complexity"]));
    const config = createConfig({ axes: ["complexity", "duplication"] });

    const result = await measure(config, registry, { timestampFn: fixedTimestampFn });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.axes).toHaveLength(1);
      expect(result.value.axes[0]?.axisId).toBe("complexity");
    }
  });

  it("skips axes when adapter is unavailable", async () => {
    const registry = new AdapterRegistry();
    registry.register(createStubAdapter("scc", ["complexity"], { available: true }));
    registry.register(createStubAdapter("jscpd", ["duplication"], { available: false }));
    const config = createConfig({ axes: ["complexity", "duplication"] });

    const result = await measure(config, registry, { timestampFn: fixedTimestampFn });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.axes).toHaveLength(1);
      expect(result.value.axes[0]?.axisId).toBe("complexity");
    }
  });

  it("falls back to next adapter when first is unavailable", async () => {
    const registry = new AdapterRegistry();
    registry.register(createStubAdapter("tool-a", ["complexity"], { available: false }));
    registry.register(
      createStubAdapter("tool-b", ["complexity"], {
        available: true,
        measureResult: (axisId) => ({
          ok: true,
          value: {
            axisId,
            summary: [createMetricValue("cyclomatic", 5)],
            files: [],
          },
        }),
      }),
    );
    const config = createConfig({ axes: ["complexity"] });

    const result = await measure(config, registry, { timestampFn: fixedTimestampFn });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.axes).toHaveLength(1);
      expect(result.value.axes[0]?.summary).toHaveLength(1);
      expect(result.value.axes[0]?.summary[0]?.value).toBe(5);
    }
  });

  it("returns error when no adapters are available for any requested axis", async () => {
    const registry = new AdapterRegistry();
    registry.register(createStubAdapter("scc", ["complexity"], { available: false }));
    const config = createConfig({ axes: ["complexity"] });

    const result = await measure(config, registry, { timestampFn: fixedTimestampFn });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("No available adapters");
      expect(result.error.message).toContain("complexity");
      expect(result.error.axisErrors).toHaveLength(0);
    }
  });

  it("returns error when no adapters are registered at all", async () => {
    const registry = new AdapterRegistry();
    const config = createConfig({ axes: ["complexity"] });

    const result = await measure(config, registry, { timestampFn: fixedTimestampFn });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("No available adapters");
    }
  });

  it("returns error when config has empty axes and no adapters are registered", async () => {
    const registry = new AdapterRegistry();
    const config = createConfig({ axes: [] });

    const result = await measure(config, registry, { timestampFn: fixedTimestampFn });

    // Empty axes means "measure all known axes", but none have adapters
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("No available adapters");
    }
  });

  it("collects adapter errors but still returns partial results", async () => {
    const registry = new AdapterRegistry();
    registry.register(
      createStubAdapter("scc", ["complexity"], {
        measureResult: () => ({
          ok: false,
          error: { adapterId: "scc", message: "tool crashed" },
        }),
      }),
    );
    registry.register(createStubAdapter("jscpd", ["duplication"]));
    const config = createConfig({ axes: ["complexity", "duplication"] });

    const result = await measure(config, registry, { timestampFn: fixedTimestampFn });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.axes).toHaveLength(1);
      expect(result.value.axes[0]?.axisId).toBe("duplication");
    }
  });

  it("includes warning for unavailable axes", async () => {
    const registry = new AdapterRegistry();
    registry.register(createStubAdapter("scc", ["complexity"]));
    const config = createConfig({ axes: ["complexity", "duplication"] });

    const result = await measure(config, registry, { timestampFn: fixedTimestampFn });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.warnings).toHaveLength(1);
      expect(result.value.warnings[0]?.axisId).toBe("duplication");
      expect(result.value.warnings[0]?.message).toContain("No available adapter");
    }
  });

  it("includes warning for adapter errors in partial results", async () => {
    const registry = new AdapterRegistry();
    registry.register(
      createStubAdapter("scc", ["complexity"], {
        measureResult: () => ({
          ok: false,
          error: { adapterId: "scc", message: "tool crashed" },
        }),
      }),
    );
    registry.register(createStubAdapter("jscpd", ["duplication"]));
    const config = createConfig({ axes: ["complexity", "duplication"] });

    const result = await measure(config, registry, { timestampFn: fixedTimestampFn });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.warnings).toHaveLength(1);
      expect(result.value.warnings[0]?.axisId).toBe("complexity");
      expect(result.value.warnings[0]?.message).toContain("scc");
      expect(result.value.warnings[0]?.message).toContain("tool crashed");
    }
  });

  it("returns empty warnings when all axes succeed", async () => {
    const registry = new AdapterRegistry();
    registry.register(createStubAdapter("scc", ["complexity"]));
    registry.register(createStubAdapter("jscpd", ["duplication"]));
    const config = createConfig({ axes: ["complexity", "duplication"] });

    const result = await measure(config, registry, { timestampFn: fixedTimestampFn });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.warnings).toHaveLength(0);
    }
  });

  it("returns error when all resolved adapters fail during measurement", async () => {
    const registry = new AdapterRegistry();
    registry.register(
      createStubAdapter("scc", ["complexity"], {
        measureResult: () => ({
          ok: false,
          error: { adapterId: "scc", message: "tool crashed" },
        }),
      }),
    );
    const config = createConfig({ axes: ["complexity"] });

    const result = await measure(config, registry, { timestampFn: fixedTimestampFn });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe("All adapters failed during measurement");
      expect(result.error.axisErrors).toHaveLength(1);
      expect(result.error.axisErrors[0]?.axisId).toBe("complexity");
      expect(result.error.axisErrors[0]?.adapterId).toBe("scc");
      expect(result.error.axisErrors[0]?.error.message).toBe("tool crashed");
    }
  });

  it("passes the target path to adapters", async () => {
    let receivedPath = "";
    const adapter: ToolAdapter = {
      id: "spy",
      toolName: "spy-tool",
      supportedAxes: ["size"],
      async checkAvailability() {
        return { available: true, version: "1.0.0" };
      },
      async measure(targetPath, axisId) {
        receivedPath = targetPath;
        return { ok: true, value: { axisId, summary: [], files: [] } };
      },
    };
    const registry = new AdapterRegistry();
    registry.register(adapter);
    const config = createConfig({ targetPath: "/my/project", axes: ["size"] });

    await measure(config, registry, { timestampFn: fixedTimestampFn });

    expect(receivedPath).toBe("/my/project");
  });

  it("uses current time when no timestampFn is provided", async () => {
    const registry = new AdapterRegistry();
    registry.register(createStubAdapter("scc", ["complexity"]));
    const config = createConfig({ axes: ["complexity"] });

    const before = new Date().toISOString();
    const result = await measure(config, registry);
    const after = new Date().toISOString();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.timestamp >= before).toBe(true);
      expect(result.value.timestamp <= after).toBe(true);
    }
  });

  it("produces deterministic output for identical inputs", async () => {
    const registry = new AdapterRegistry();
    registry.register(
      createStubAdapter("scc", ["complexity"], {
        measureResult: (axisId) => ({
          ok: true,
          value: {
            axisId,
            summary: [createMetricValue("cyclomatic", 10)],
            files: [
              {
                filePath: "/tmp/test-project/main.ts",
                metrics: [createMetricValue("cyclomatic", 10)],
              },
            ],
          },
        }),
      }),
    );
    const config = createConfig({ axes: ["complexity"] });
    const opts = { timestampFn: fixedTimestampFn };

    const result1 = await measure(config, registry, opts);
    const result2 = await measure(config, registry, opts);

    expect(result1).toEqual(result2);
  });

  it("runs independent adapters concurrently", async () => {
    const DELAY_MS = 50;
    const executionLog: string[] = [];

    function createDelayedAdapter(
      id: string,
      axis: AxisId,
    ): ToolAdapter {
      return {
        id,
        toolName: `delayed-${id}`,
        supportedAxes: [axis],
        async checkAvailability(): Promise<ToolAvailability> {
          return { available: true, version: "1.0.0" };
        },
        async measure(
          _targetPath: string,
          axisId: AxisId,
        ): Promise<Result<AxisMeasurement, AdapterError>> {
          executionLog.push(`start:${id}`);
          await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
          executionLog.push(`end:${id}`);
          return { ok: true, value: { axisId, summary: [], files: [] } };
        },
      };
    }

    const registry = new AdapterRegistry();
    registry.register(createDelayedAdapter("adapter-a", "complexity"));
    registry.register(createDelayedAdapter("adapter-b", "duplication"));
    registry.register(createDelayedAdapter("adapter-c", "size"));
    const config = createConfig({ axes: ["complexity", "duplication", "size"] });

    const start = Date.now();
    const result = await measure(config, registry, { timestampFn: fixedTimestampFn });
    const elapsed = Date.now() - start;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.axes).toHaveLength(3);
    }

    // If sequential, elapsed ≥ 3 * DELAY_MS (150ms).
    // If parallel, elapsed ≈ DELAY_MS (50ms).
    // Use a generous threshold to avoid flaky timing in CI.
    expect(elapsed).toBeLessThan(DELAY_MS * 2.5);

    // All adapters should start before any finishes (concurrent execution).
    const starts = executionLog.filter((e) => e.startsWith("start:"));
    const ends = executionLog.filter((e) => e.startsWith("end:"));
    expect(starts).toHaveLength(3);
    expect(ends).toHaveLength(3);
    // In parallel execution, all starts precede all ends.
    const firstEndIndex = executionLog.findIndex((e) => e.startsWith("end:"));
    const lastStartIndex = executionLog.lastIndexOf(
      executionLog.filter((e) => e.startsWith("start:")).at(-1)!,
    );
    expect(lastStartIndex).toBeLessThan(firstEndIndex);
  });

  it("checks adapter availability concurrently", async () => {
    const DELAY_MS = 50;
    const availabilityLog: string[] = [];

    function createSlowAvailabilityAdapter(
      id: string,
      axis: AxisId,
    ): ToolAdapter {
      return {
        id,
        toolName: `slow-avail-${id}`,
        supportedAxes: [axis],
        async checkAvailability(): Promise<ToolAvailability> {
          availabilityLog.push(`start:${id}`);
          await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
          availabilityLog.push(`end:${id}`);
          return { available: true, version: "1.0.0" };
        },
        async measure(
          _targetPath: string,
          axisId: AxisId,
        ): Promise<Result<AxisMeasurement, AdapterError>> {
          return { ok: true, value: { axisId, summary: [], files: [] } };
        },
      };
    }

    const registry = new AdapterRegistry();
    registry.register(createSlowAvailabilityAdapter("adapter-a", "complexity"));
    registry.register(createSlowAvailabilityAdapter("adapter-b", "duplication"));
    registry.register(createSlowAvailabilityAdapter("adapter-c", "size"));
    const config = createConfig({ axes: ["complexity", "duplication", "size"] });

    const start = Date.now();
    const result = await measure(config, registry, { timestampFn: fixedTimestampFn });
    const elapsed = Date.now() - start;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.axes).toHaveLength(3);
    }

    // If sequential, elapsed ≥ 3 * DELAY_MS (150ms) for availability alone.
    // If parallel, elapsed ≈ DELAY_MS (50ms) for availability.
    // Use a generous threshold to avoid flaky timing in CI.
    expect(elapsed).toBeLessThan(DELAY_MS * 2.5);

    // All availability checks should start before any finishes.
    const starts = availabilityLog.filter((e) => e.startsWith("start:"));
    const ends = availabilityLog.filter((e) => e.startsWith("end:"));
    expect(starts).toHaveLength(3);
    expect(ends).toHaveLength(3);
    const firstEndIndex = availabilityLog.findIndex((e) => e.startsWith("end:"));
    const lastStartIndex = availabilityLog.lastIndexOf(
      availabilityLog.filter((e) => e.startsWith("start:")).at(-1)!,
    );
    expect(lastStartIndex).toBeLessThan(firstEndIndex);
  });
});
