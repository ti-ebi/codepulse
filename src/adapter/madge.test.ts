/**
 * Tests for the madge adapter.
 *
 * madge provides dependency graph analysis (circular dependencies, graph depth),
 * mapped to the "dependency-health" axis.
 *
 * The adapter follows the Three-Line pattern:
 *   1. Invoke madge with --json and --circular --json
 *   2. Parse the JSON output
 *   3. Map to CodePulse's AxisMeasurement schema
 */

import { describe, it, expect } from "vitest";
import {
  parseMadgeOutput,
  createMadgeAdapter,
  type MadgeDependencyGraph,
  type MadgeCircularDeps,
  type MadgeExecFn,
} from "./madge.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGraph(entries?: Record<string, readonly string[]>): MadgeDependencyGraph {
  return entries ?? {};
}

function makeCircular(chains?: readonly (readonly string[])[]): MadgeCircularDeps {
  return chains ?? [];
}

// ---------------------------------------------------------------------------
// parseMadgeOutput — dependency-health axis
// ---------------------------------------------------------------------------

describe("parseMadgeOutput", () => {
  it("produces an AxisMeasurement with axisId 'dependency-health'", () => {
    const result = parseMadgeOutput(makeGraph(), makeCircular());
    expect(result.axisId).toBe("dependency-health");
  });

  it("counts total modules in the dependency graph", () => {
    const graph = makeGraph({
      "src/a.ts": ["src/b.ts"],
      "src/b.ts": ["src/c.ts"],
      "src/c.ts": [],
    });
    const result = parseMadgeOutput(graph, makeCircular());

    const metric = result.summary.find((m) => m.descriptor.id === "total-modules");
    expect(metric?.value).toBe(3);
  });

  it("counts total dependencies (edges) in the graph", () => {
    const graph = makeGraph({
      "src/a.ts": ["src/b.ts", "src/c.ts"],
      "src/b.ts": ["src/c.ts"],
      "src/c.ts": [],
    });
    const result = parseMadgeOutput(graph, makeCircular());

    const metric = result.summary.find((m) => m.descriptor.id === "total-edges");
    expect(metric?.value).toBe(3);
  });

  it("counts circular dependency chains", () => {
    const circular = makeCircular([
      ["src/a.ts", "src/b.ts", "src/a.ts"],
      ["src/c.ts", "src/d.ts", "src/c.ts"],
    ]);
    const result = parseMadgeOutput(makeGraph(), circular);

    const metric = result.summary.find((m) => m.descriptor.id === "circular-dependency-count");
    expect(metric?.value).toBe(2);
  });

  it("counts modules involved in circular dependencies", () => {
    const circular = makeCircular([
      ["src/a.ts", "src/b.ts"],
      ["src/c.ts", "src/d.ts", "src/e.ts"],
    ]);
    const result = parseMadgeOutput(makeGraph(), circular);

    const metric = result.summary.find((m) => m.descriptor.id === "modules-in-cycles");
    // Unique modules: a, b, c, d, e = 5
    expect(metric?.value).toBe(5);
  });

  it("deduplicates modules across multiple circular chains", () => {
    const circular = makeCircular([
      ["src/a.ts", "src/b.ts"],
      ["src/a.ts", "src/c.ts"],
    ]);
    const result = parseMadgeOutput(makeGraph(), circular);

    const metric = result.summary.find((m) => m.descriptor.id === "modules-in-cycles");
    // Unique modules: a, b, c = 3
    expect(metric?.value).toBe(3);
  });

  it("computes maximum graph depth", () => {
    // a -> b -> c -> d (depth 3 from a)
    const graph = makeGraph({
      "src/a.ts": ["src/b.ts"],
      "src/b.ts": ["src/c.ts"],
      "src/c.ts": ["src/d.ts"],
      "src/d.ts": [],
    });
    const result = parseMadgeOutput(graph, makeCircular());

    const metric = result.summary.find((m) => m.descriptor.id === "max-graph-depth");
    expect(metric?.value).toBe(3);
  });

  it("computes average dependencies per module", () => {
    const graph = makeGraph({
      "src/a.ts": ["src/b.ts", "src/c.ts"],
      "src/b.ts": ["src/c.ts"],
      "src/c.ts": [],
    });
    const result = parseMadgeOutput(graph, makeCircular());

    const metric = result.summary.find((m) => m.descriptor.id === "average-deps-per-module");
    // (2 + 1 + 0) / 3 = 1
    expect(metric?.value).toBe(1);
  });

  it("handles empty graph with zero metrics", () => {
    const result = parseMadgeOutput(makeGraph(), makeCircular());

    const modules = result.summary.find((m) => m.descriptor.id === "total-modules");
    expect(modules?.value).toBe(0);
    const circular = result.summary.find((m) => m.descriptor.id === "circular-dependency-count");
    expect(circular?.value).toBe(0);
    const depth = result.summary.find((m) => m.descriptor.id === "max-graph-depth");
    expect(depth?.value).toBe(0);
    expect(result.files).toHaveLength(0);
  });

  it("includes metric metadata with correct units", () => {
    const result = parseMadgeOutput(makeGraph(), makeCircular());

    const modulesMetric = result.summary.find((m) => m.descriptor.id === "total-modules");
    expect(modulesMetric?.descriptor.unit).toBe("modules");
    expect(modulesMetric?.descriptor.min).toBe(0);
    expect(modulesMetric?.descriptor.max).toBeNull();

    const circularMetric = result.summary.find((m) => m.descriptor.id === "circular-dependency-count");
    expect(circularMetric?.descriptor.unit).toBe("count");
    expect(circularMetric?.descriptor.min).toBe(0);
    expect(circularMetric?.descriptor.max).toBeNull();
  });

  it("produces per-file measurements with dependency count", () => {
    const graph = makeGraph({
      "src/a.ts": ["src/b.ts", "src/c.ts"],
      "src/b.ts": ["src/c.ts"],
      "src/c.ts": [],
    });
    const result = parseMadgeOutput(graph, makeCircular());

    const fileA = result.files.find((f) => f.filePath === "src/a.ts");
    expect(fileA).toBeDefined();
    const depsMetric = fileA!.metrics.find((m) => m.descriptor.id === "file-dependency-count");
    expect(depsMetric?.value).toBe(2);

    const fileC = result.files.find((f) => f.filePath === "src/c.ts");
    expect(fileC).toBeDefined();
    const fileCDeps = fileC!.metrics.find((m) => m.descriptor.id === "file-dependency-count");
    expect(fileCDeps?.value).toBe(0);
  });

  it("marks files involved in circular dependencies", () => {
    const graph = makeGraph({
      "src/a.ts": ["src/b.ts"],
      "src/b.ts": ["src/a.ts"],
      "src/c.ts": [],
    });
    const circular = makeCircular([["src/a.ts", "src/b.ts"]]);
    const result = parseMadgeOutput(graph, circular);

    const fileA = result.files.find((f) => f.filePath === "src/a.ts");
    const inCycle = fileA!.metrics.find((m) => m.descriptor.id === "file-in-cycle");
    expect(inCycle?.value).toBe(1);

    const fileC = result.files.find((f) => f.filePath === "src/c.ts");
    const notInCycle = fileC!.metrics.find((m) => m.descriptor.id === "file-in-cycle");
    expect(notInCycle?.value).toBe(0);
  });

  it("handles graph with cycles when computing depth (avoids infinite loop)", () => {
    const graph = makeGraph({
      "src/a.ts": ["src/b.ts"],
      "src/b.ts": ["src/a.ts"],
    });
    const circular = makeCircular([["src/a.ts", "src/b.ts"]]);
    const result = parseMadgeOutput(graph, circular);

    const depth = result.summary.find((m) => m.descriptor.id === "max-graph-depth");
    // With cycle, depth should be finite (1 each way)
    expect(depth?.value).toBe(1);
  });

  it("produces deterministic output for identical input", () => {
    const graph = makeGraph({
      "src/a.ts": ["src/b.ts"],
      "src/b.ts": [],
    });
    const circular = makeCircular([["src/a.ts", "src/b.ts"]]);

    const result1 = parseMadgeOutput(graph, circular);
    const result2 = parseMadgeOutput(graph, circular);
    expect(result1).toEqual(result2);
  });
});

// ---------------------------------------------------------------------------
// createMadgeAdapter — adapter factory
// ---------------------------------------------------------------------------

describe("createMadgeAdapter", () => {
  it("reports availability when madge is found", async () => {
    const execFn: MadgeExecFn = async (_args) => ({
      ok: true as const,
      stdout: "4.0.0",
    });
    const adapter = createMadgeAdapter(execFn);
    const availability = await adapter.checkAvailability();
    expect(availability.available).toBe(true);
    if (availability.available) {
      expect(availability.version).toBe("4.0.0");
    }
  });

  it("reports unavailability when madge is not found", async () => {
    const execFn: MadgeExecFn = async () => ({
      ok: false as const,
      error: "command not found",
    });
    const adapter = createMadgeAdapter(execFn);
    const availability = await adapter.checkAvailability();
    expect(availability.available).toBe(false);
  });

  it("has id 'madge' and supports dependency-health axis", () => {
    const execFn: MadgeExecFn = async () => ({ ok: true as const, stdout: "" });
    const adapter = createMadgeAdapter(execFn);
    expect(adapter.id).toBe("madge");
    expect(adapter.supportedAxes).toContain("dependency-health");
  });

  it("invokes madge with --json for dependency graph and --circular --json for cycles", async () => {
    const graphJson = JSON.stringify({
      "src/a.ts": ["src/b.ts"],
      "src/b.ts": [],
    });
    const circularJson = JSON.stringify([["src/a.ts", "src/b.ts"]]);

    const capturedCalls: (readonly string[])[] = [];

    const execFn: MadgeExecFn = async (args) => {
      capturedCalls.push(args);
      if (args.includes("--circular")) {
        return { ok: true as const, stdout: circularJson };
      }
      return { ok: true as const, stdout: graphJson };
    };
    const adapter = createMadgeAdapter(execFn);
    const result = await adapter.measure("/project/src", "dependency-health");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.axisId).toBe("dependency-health");
    }

    // Should have made two calls: one for graph, one for circular
    expect(capturedCalls).toHaveLength(2);
    // Graph call should have --json
    expect(capturedCalls[0]).toContain("--json");
    // Circular call should have --circular and --json
    expect(capturedCalls[1]).toContain("--circular");
    expect(capturedCalls[1]).toContain("--json");
  });

  it("returns an error when madge execution fails", async () => {
    const execFn: MadgeExecFn = async () => ({
      ok: false as const,
      error: "madge crashed",
    });
    const adapter = createMadgeAdapter(execFn);
    const result = await adapter.measure("/project/src", "dependency-health");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.adapterId).toBe("madge");
      expect(result.error.message).toContain("madge");
    }
  });

  it("returns an error when JSON output is invalid", async () => {
    const execFn: MadgeExecFn = async () => ({
      ok: true as const,
      stdout: "not valid json {{{",
    });
    const adapter = createMadgeAdapter(execFn);
    const result = await adapter.measure("/project/src", "dependency-health");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.adapterId).toBe("madge");
      expect(result.error.message).toContain("parse");
    }
  });

  it("parses version from madge --version output", async () => {
    const execFn: MadgeExecFn = async (args) => {
      if (args.includes("--version")) {
        return { ok: true as const, stdout: "4.0.0\n" };
      }
      return { ok: true as const, stdout: "{}" };
    };
    const adapter = createMadgeAdapter(execFn);
    const availability = await adapter.checkAvailability();
    expect(availability.available).toBe(true);
    if (availability.available) {
      expect(availability.version).toBe("4.0.0");
    }
  });

  it("handles circular command failure gracefully (returns empty circular array)", async () => {
    const graphJson = JSON.stringify({
      "src/a.ts": ["src/b.ts"],
      "src/b.ts": [],
    });

    let callCount = 0;
    const execFn: MadgeExecFn = async (args) => {
      callCount++;
      if (args.includes("--circular")) {
        return { ok: false as const, error: "circular check failed" };
      }
      return { ok: true as const, stdout: graphJson };
    };
    const adapter = createMadgeAdapter(execFn);
    const result = await adapter.measure("/project/src", "dependency-health");

    // Should still succeed with graph data, treating circular as empty
    expect(result.ok).toBe(true);
    if (result.ok) {
      const modules = result.value.summary.find((m) => m.descriptor.id === "total-modules");
      expect(modules?.value).toBe(2);
      const circular = result.value.summary.find((m) => m.descriptor.id === "circular-dependency-count");
      expect(circular?.value).toBe(0);
    }
  });
});
