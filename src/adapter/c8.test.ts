/**
 * Tests for the c8 adapter.
 *
 * c8 provides code coverage using Node.js' built-in V8 coverage,
 * mapped to the "test-coverage" axis.
 *
 * The adapter follows the Three-Line pattern:
 *   1. Invoke c8 report --reporter=json-summary --temp-directory=...
 *   2. Parse the coverage-summary.json output
 *   3. Map to CodePulse's AxisMeasurement schema
 */

import { describe, it, expect } from "vitest";
import {
  parseC8Output,
  createC8Adapter,
  type C8CoverageSummary,
  type C8ExecFn,
  type C8ReadFn,
} from "./c8.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSummary(overrides?: Partial<C8CoverageSummary>): C8CoverageSummary {
  return {
    total: {
      lines: { total: 100, covered: 80, skipped: 0, pct: 80 },
      statements: { total: 120, covered: 96, skipped: 0, pct: 80 },
      functions: { total: 30, covered: 24, skipped: 0, pct: 80 },
      branches: { total: 40, covered: 32, skipped: 0, pct: 80 },
    },
    ...overrides,
  };
}

function makeFileSummary(overrides?: {
  lines?: Partial<C8CoverageSummary["total"]["lines"]>;
  statements?: Partial<C8CoverageSummary["total"]["statements"]>;
  functions?: Partial<C8CoverageSummary["total"]["functions"]>;
  branches?: Partial<C8CoverageSummary["total"]["branches"]>;
}): C8CoverageSummary["total"] {
  return {
    lines: { total: 10, covered: 8, skipped: 0, pct: 80, ...overrides?.lines },
    statements: { total: 12, covered: 10, skipped: 0, pct: 83.33, ...overrides?.statements },
    functions: { total: 3, covered: 2, skipped: 0, pct: 66.67, ...overrides?.functions },
    branches: { total: 4, covered: 3, skipped: 0, pct: 75, ...overrides?.branches },
  };
}

// ---------------------------------------------------------------------------
// parseC8Output — test-coverage axis
// ---------------------------------------------------------------------------

describe("parseC8Output", () => {
  it("produces an AxisMeasurement with axisId 'test-coverage'", () => {
    const result = parseC8Output(makeSummary());
    expect(result.axisId).toBe("test-coverage");
  });

  it("includes line coverage percentage in summary", () => {
    const result = parseC8Output(makeSummary());
    const metric = result.summary.find((m) => m.descriptor.id === "line-coverage-pct");
    expect(metric?.value).toBe(80);
  });

  it("includes statement coverage percentage in summary", () => {
    const result = parseC8Output(makeSummary());
    const metric = result.summary.find((m) => m.descriptor.id === "statement-coverage-pct");
    expect(metric?.value).toBe(80);
  });

  it("includes function coverage percentage in summary", () => {
    const result = parseC8Output(makeSummary());
    const metric = result.summary.find((m) => m.descriptor.id === "function-coverage-pct");
    expect(metric?.value).toBe(80);
  });

  it("includes branch coverage percentage in summary", () => {
    const result = parseC8Output(makeSummary());
    const metric = result.summary.find((m) => m.descriptor.id === "branch-coverage-pct");
    expect(metric?.value).toBe(80);
  });

  it("includes total and covered counts for lines in summary", () => {
    const result = parseC8Output(makeSummary());
    const totalLines = result.summary.find((m) => m.descriptor.id === "total-lines");
    expect(totalLines?.value).toBe(100);
    const coveredLines = result.summary.find((m) => m.descriptor.id === "covered-lines");
    expect(coveredLines?.value).toBe(80);
  });

  it("includes total and covered counts for functions in summary", () => {
    const result = parseC8Output(makeSummary());
    const totalFns = result.summary.find((m) => m.descriptor.id === "total-functions");
    expect(totalFns?.value).toBe(30);
    const coveredFns = result.summary.find((m) => m.descriptor.id === "covered-functions");
    expect(coveredFns?.value).toBe(24);
  });

  it("includes total and covered counts for branches in summary", () => {
    const result = parseC8Output(makeSummary());
    const totalBranches = result.summary.find((m) => m.descriptor.id === "total-branches");
    expect(totalBranches?.value).toBe(40);
    const coveredBranches = result.summary.find((m) => m.descriptor.id === "covered-branches");
    expect(coveredBranches?.value).toBe(32);
  });

  it("handles zero totals gracefully", () => {
    const summary = makeSummary({
      total: {
        lines: { total: 0, covered: 0, skipped: 0, pct: 0 },
        statements: { total: 0, covered: 0, skipped: 0, pct: 0 },
        functions: { total: 0, covered: 0, skipped: 0, pct: 0 },
        branches: { total: 0, covered: 0, skipped: 0, pct: 0 },
      },
    });
    const result = parseC8Output(summary);

    const linePct = result.summary.find((m) => m.descriptor.id === "line-coverage-pct");
    expect(linePct?.value).toBe(0);
    const totalLines = result.summary.find((m) => m.descriptor.id === "total-lines");
    expect(totalLines?.value).toBe(0);
  });

  it("produces per-file measurements from file entries", () => {
    const summary: C8CoverageSummary = {
      total: {
        lines: { total: 20, covered: 16, skipped: 0, pct: 80 },
        statements: { total: 24, covered: 20, skipped: 0, pct: 83.33 },
        functions: { total: 6, covered: 4, skipped: 0, pct: 66.67 },
        branches: { total: 8, covered: 6, skipped: 0, pct: 75 },
      },
      "/project/src/a.ts": makeFileSummary({ lines: { pct: 90 } }),
      "/project/src/b.ts": makeFileSummary({ lines: { pct: 70 } }),
    };

    const result = parseC8Output(summary);

    expect(result.files).toHaveLength(2);
    const fileA = result.files.find((f) => f.filePath === "/project/src/a.ts");
    expect(fileA).toBeDefined();
    const lineMetric = fileA!.metrics.find((m) => m.descriptor.id === "file-line-coverage-pct");
    expect(lineMetric?.value).toBe(90);

    const fileB = result.files.find((f) => f.filePath === "/project/src/b.ts");
    expect(fileB).toBeDefined();
    const lineBMetric = fileB!.metrics.find((m) => m.descriptor.id === "file-line-coverage-pct");
    expect(lineBMetric?.value).toBe(70);
  });

  it("includes per-file function and branch coverage", () => {
    const summary: C8CoverageSummary = {
      total: {
        lines: { total: 10, covered: 10, skipped: 0, pct: 100 },
        statements: { total: 10, covered: 10, skipped: 0, pct: 100 },
        functions: { total: 3, covered: 3, skipped: 0, pct: 100 },
        branches: { total: 2, covered: 2, skipped: 0, pct: 100 },
      },
      "/project/src/a.ts": makeFileSummary({
        functions: { pct: 50 },
        branches: { pct: 75 },
      }),
    };
    const result = parseC8Output(summary);

    const fileA = result.files.find((f) => f.filePath === "/project/src/a.ts");
    expect(fileA).toBeDefined();
    const fnMetric = fileA!.metrics.find((m) => m.descriptor.id === "file-function-coverage-pct");
    expect(fnMetric?.value).toBe(50);
    const branchMetric = fileA!.metrics.find((m) => m.descriptor.id === "file-branch-coverage-pct");
    expect(branchMetric?.value).toBe(75);
  });

  it("excludes the 'total' key from per-file measurements", () => {
    const summary = makeSummary();
    const result = parseC8Output(summary);
    const totalFile = result.files.find((f) => f.filePath === "total");
    expect(totalFile).toBeUndefined();
  });

  it("includes metric metadata with correct units and ranges", () => {
    const result = parseC8Output(makeSummary());

    const linePct = result.summary.find((m) => m.descriptor.id === "line-coverage-pct");
    expect(linePct?.descriptor.unit).toBe("percent");
    expect(linePct?.descriptor.min).toBe(0);
    expect(linePct?.descriptor.max).toBe(100);

    const totalLines = result.summary.find((m) => m.descriptor.id === "total-lines");
    expect(totalLines?.descriptor.unit).toBe("lines");
    expect(totalLines?.descriptor.min).toBe(0);
    expect(totalLines?.descriptor.max).toBeNull();
  });

  it("sorts per-file measurements by file path for determinism", () => {
    const summary: C8CoverageSummary = {
      total: {
        lines: { total: 20, covered: 16, skipped: 0, pct: 80 },
        statements: { total: 24, covered: 20, skipped: 0, pct: 83.33 },
        functions: { total: 6, covered: 4, skipped: 0, pct: 66.67 },
        branches: { total: 8, covered: 6, skipped: 0, pct: 75 },
      },
      "/project/src/z.ts": makeFileSummary(),
      "/project/src/a.ts": makeFileSummary(),
      "/project/src/m.ts": makeFileSummary(),
    };
    const result = parseC8Output(summary);

    expect(result.files[0]?.filePath).toBe("/project/src/a.ts");
    expect(result.files[1]?.filePath).toBe("/project/src/m.ts");
    expect(result.files[2]?.filePath).toBe("/project/src/z.ts");
  });

  it("produces deterministic output for identical input", () => {
    const summary = makeSummary({
      "/project/src/a.ts": makeFileSummary(),
    });
    const result1 = parseC8Output(summary);
    const result2 = parseC8Output(summary);
    expect(result1).toEqual(result2);
  });
});

// ---------------------------------------------------------------------------
// createC8Adapter — adapter factory
// ---------------------------------------------------------------------------

describe("createC8Adapter", () => {
  it("reports availability when c8 is found", async () => {
    const execFn: C8ExecFn = async (_args) => ({
      ok: true as const,
      stdout: "8.0.1",
    });
    const readFn: C8ReadFn = async () => ({ ok: true as const, content: "{}" });
    const adapter = createC8Adapter(execFn, readFn);
    const availability = await adapter.checkAvailability();
    expect(availability.available).toBe(true);
    if (availability.available) {
      expect(availability.version).toBe("8.0.1");
    }
  });

  it("reports unavailability when c8 is not found", async () => {
    const execFn: C8ExecFn = async () => ({
      ok: false as const,
      error: "command not found",
    });
    const readFn: C8ReadFn = async () => ({ ok: false as const, error: "not found" });
    const adapter = createC8Adapter(execFn, readFn);
    const availability = await adapter.checkAvailability();
    expect(availability.available).toBe(false);
  });

  it("has id 'c8' and supports test-coverage axis", () => {
    const execFn: C8ExecFn = async () => ({ ok: true as const, stdout: "" });
    const readFn: C8ReadFn = async () => ({ ok: true as const, content: "{}" });
    const adapter = createC8Adapter(execFn, readFn);
    expect(adapter.id).toBe("c8");
    expect(adapter.supportedAxes).toContain("test-coverage");
  });

  it("invokes c8 report with json-summary reporter", async () => {
    const summaryJson = JSON.stringify(makeSummary());
    const capturedCalls: (readonly string[])[] = [];

    const execFn: C8ExecFn = async (args) => {
      capturedCalls.push(args);
      return { ok: true as const, stdout: "" };
    };
    const readFn: C8ReadFn = async () => ({
      ok: true as const,
      content: summaryJson,
    });
    const adapter = createC8Adapter(execFn, readFn);
    const result = await adapter.measure("/project", "test-coverage");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.axisId).toBe("test-coverage");
    }

    // Should invoke c8 report with --reporter=json-summary
    expect(capturedCalls).toHaveLength(1);
    expect(capturedCalls[0]).toContain("report");
    expect(capturedCalls[0]).toContain("--reporter=json-summary");
  });

  it("returns an error when c8 report execution fails", async () => {
    const execFn: C8ExecFn = async () => ({
      ok: false as const,
      error: "c8 crashed",
    });
    const readFn: C8ReadFn = async () => ({ ok: false as const, error: "not found" });
    const adapter = createC8Adapter(execFn, readFn);
    const result = await adapter.measure("/project", "test-coverage");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.adapterId).toBe("c8");
      expect(result.error.message).toContain("c8");
    }
  });

  it("returns an error when coverage-summary.json cannot be read", async () => {
    const execFn: C8ExecFn = async () => ({
      ok: true as const,
      stdout: "",
    });
    const readFn: C8ReadFn = async () => ({
      ok: false as const,
      error: "ENOENT: no such file",
    });
    const adapter = createC8Adapter(execFn, readFn);
    const result = await adapter.measure("/project", "test-coverage");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.adapterId).toBe("c8");
      expect(result.error.message).toContain("coverage-summary.json");
    }
  });

  it("returns an error when JSON output is invalid", async () => {
    const execFn: C8ExecFn = async () => ({
      ok: true as const,
      stdout: "",
    });
    const readFn: C8ReadFn = async () => ({
      ok: true as const,
      content: "not valid json {{{",
    });
    const adapter = createC8Adapter(execFn, readFn);
    const result = await adapter.measure("/project", "test-coverage");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.adapterId).toBe("c8");
      expect(result.error.message).toContain("parse");
    }
  });

  it("parses version from c8 --version output", async () => {
    const execFn: C8ExecFn = async (args) => {
      if (args.includes("--version")) {
        return { ok: true as const, stdout: "8.0.1\n" };
      }
      return { ok: true as const, stdout: "" };
    };
    const readFn: C8ReadFn = async () => ({ ok: true as const, content: "{}" });
    const adapter = createC8Adapter(execFn, readFn);
    const availability = await adapter.checkAvailability();
    expect(availability.available).toBe(true);
    if (availability.available) {
      expect(availability.version).toBe("8.0.1");
    }
  });

  it("reads coverage-summary.json from the correct path", async () => {
    const capturedPaths: string[] = [];

    const execFn: C8ExecFn = async () => ({
      ok: true as const,
      stdout: "",
    });
    const readFn: C8ReadFn = async (path) => {
      capturedPaths.push(path);
      return {
        ok: true as const,
        content: JSON.stringify(makeSummary()),
      };
    };
    const adapter = createC8Adapter(execFn, readFn);
    await adapter.measure("/project", "test-coverage");

    expect(capturedPaths).toHaveLength(1);
    expect(capturedPaths[0]).toContain("coverage-summary.json");
  });
});
