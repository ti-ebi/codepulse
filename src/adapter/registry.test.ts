import { describe, it, expect } from "vitest";
import { AdapterRegistry } from "./registry.js";
import type { ToolAdapter, ToolAvailability } from "./adapter.js";
import type { AxisId } from "../types/axis.js";
import type { AxisMeasurement } from "../types/measurement.js";
import type { Result } from "../types/result.js";
import type { AdapterError } from "./adapter.js";

function createStubAdapter(
  id: string,
  supportedAxes: AxisId[],
): ToolAdapter {
  return {
    id,
    toolName: `stub-${id}`,
    supportedAxes,
    async checkAvailability(): Promise<ToolAvailability> {
      return { available: true, version: "1.0.0" };
    },
    async measure(
      _targetPath: string,
      _axisId: AxisId,
    ): Promise<Result<AxisMeasurement, AdapterError>> {
      return {
        ok: true,
        value: {
          axisId: _axisId,
          summary: [],
          files: [],
        },
      };
    },
  };
}

describe("AdapterRegistry", () => {
  it("registers and retrieves an adapter by id", () => {
    const registry = new AdapterRegistry();
    const adapter = createStubAdapter("scc", ["complexity", "size"]);

    registry.register(adapter);

    expect(registry.getAdapter("scc")).toBe(adapter);
  });

  it("throws on duplicate registration", () => {
    const registry = new AdapterRegistry();
    const adapter1 = createStubAdapter("scc", ["complexity"]);
    const adapter2 = createStubAdapter("scc", ["size"]);

    registry.register(adapter1);

    expect(() => registry.register(adapter2)).toThrow(
      'Adapter with id "scc" is already registered',
    );
  });

  it("returns undefined for unregistered adapter id", () => {
    const registry = new AdapterRegistry();
    expect(registry.getAdapter("nonexistent")).toBeUndefined();
  });

  it("finds adapters by supported axis", () => {
    const registry = new AdapterRegistry();
    const scc = createStubAdapter("scc", ["complexity", "size"]);
    const jscpd = createStubAdapter("jscpd", ["duplication"]);

    registry.register(scc);
    registry.register(jscpd);

    const complexityAdapters = registry.getAdaptersForAxis("complexity");
    expect(complexityAdapters).toHaveLength(1);
    expect(complexityAdapters[0]).toBe(scc);

    const sizeAdapters = registry.getAdaptersForAxis("size");
    expect(sizeAdapters).toHaveLength(1);
    expect(sizeAdapters[0]).toBe(scc);

    const duplicationAdapters =
      registry.getAdaptersForAxis("duplication");
    expect(duplicationAdapters).toHaveLength(1);
    expect(duplicationAdapters[0]).toBe(jscpd);
  });

  it("returns empty array when no adapter supports an axis", () => {
    const registry = new AdapterRegistry();
    const scc = createStubAdapter("scc", ["complexity"]);
    registry.register(scc);

    const result = registry.getAdaptersForAxis("dead-code");
    expect(result).toHaveLength(0);
  });

  it("lists all registered adapter ids", () => {
    const registry = new AdapterRegistry();
    registry.register(createStubAdapter("scc", ["complexity"]));
    registry.register(createStubAdapter("jscpd", ["duplication"]));
    registry.register(createStubAdapter("knip", ["dead-code"]));

    const ids = registry.getRegisteredIds();
    expect(ids).toEqual(["scc", "jscpd", "knip"]);
  });

  it("returns empty list when no adapters are registered", () => {
    const registry = new AdapterRegistry();
    expect(registry.getRegisteredIds()).toEqual([]);
    expect(registry.getAdaptersForAxis("complexity")).toEqual([]);
  });

  it("supports multiple adapters for the same axis", () => {
    const registry = new AdapterRegistry();
    const adapter1 = createStubAdapter("tool-a", ["complexity"]);
    const adapter2 = createStubAdapter("tool-b", ["complexity"]);

    registry.register(adapter1);
    registry.register(adapter2);

    const adapters = registry.getAdaptersForAxis("complexity");
    expect(adapters).toHaveLength(2);
    expect(adapters).toContain(adapter1);
    expect(adapters).toContain(adapter2);
  });
});
