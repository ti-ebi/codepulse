/**
 * Tests for the ESLint adapter.
 *
 * ESLint provides linting for JavaScript/TypeScript code, detecting
 * naming convention violations and formatting inconsistencies,
 * mapped to the "consistency" axis.
 *
 * The adapter follows the Three-Line pattern:
 *   1. Invoke eslint --format json <target>
 *   2. Parse the JSON output
 *   3. Map to CodePulse's AxisMeasurement schema
 */

import { describe, it, expect } from "vitest";
import {
  parseEslintOutput,
  createEslintAdapter,
  type EslintFileResult,
  type EslintExecFn,
} from "./eslint.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFileResult(overrides?: Partial<EslintFileResult>): EslintFileResult {
  return {
    filePath: "/project/src/a.ts",
    messages: [],
    errorCount: 0,
    warningCount: 0,
    fixableErrorCount: 0,
    fixableWarningCount: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseEslintOutput — consistency axis
// ---------------------------------------------------------------------------

describe("parseEslintOutput", () => {
  it("produces an AxisMeasurement with axisId 'consistency'", () => {
    const result = parseEslintOutput([]);
    expect(result.axisId).toBe("consistency");
  });

  it("counts total files analyzed", () => {
    const files = [
      makeFileResult({ filePath: "/project/src/a.ts" }),
      makeFileResult({ filePath: "/project/src/b.ts" }),
    ];
    const result = parseEslintOutput(files);
    const metric = result.summary.find((m) => m.descriptor.id === "total-files-linted");
    expect(metric?.value).toBe(2);
  });

  it("counts total errors across all files", () => {
    const files = [
      makeFileResult({ filePath: "/project/src/a.ts", errorCount: 3 }),
      makeFileResult({ filePath: "/project/src/b.ts", errorCount: 2 }),
    ];
    const result = parseEslintOutput(files);
    const metric = result.summary.find((m) => m.descriptor.id === "total-errors");
    expect(metric?.value).toBe(5);
  });

  it("counts total warnings across all files", () => {
    const files = [
      makeFileResult({ filePath: "/project/src/a.ts", warningCount: 4 }),
      makeFileResult({ filePath: "/project/src/b.ts", warningCount: 1 }),
    ];
    const result = parseEslintOutput(files);
    const metric = result.summary.find((m) => m.descriptor.id === "total-warnings");
    expect(metric?.value).toBe(5);
  });

  it("counts total issues (errors + warnings)", () => {
    const files = [
      makeFileResult({ filePath: "/project/src/a.ts", errorCount: 2, warningCount: 3 }),
    ];
    const result = parseEslintOutput(files);
    const metric = result.summary.find((m) => m.descriptor.id === "total-issues");
    expect(metric?.value).toBe(5);
  });

  it("counts files with zero issues", () => {
    const files = [
      makeFileResult({ filePath: "/project/src/a.ts", errorCount: 0, warningCount: 0 }),
      makeFileResult({ filePath: "/project/src/b.ts", errorCount: 1, warningCount: 0 }),
      makeFileResult({ filePath: "/project/src/c.ts", errorCount: 0, warningCount: 0 }),
    ];
    const result = parseEslintOutput(files);
    const metric = result.summary.find((m) => m.descriptor.id === "clean-files");
    expect(metric?.value).toBe(2);
  });

  it("computes clean file ratio as percentage", () => {
    const files = [
      makeFileResult({ filePath: "/project/src/a.ts", errorCount: 0, warningCount: 0 }),
      makeFileResult({ filePath: "/project/src/b.ts", errorCount: 1, warningCount: 0 }),
      makeFileResult({ filePath: "/project/src/c.ts", errorCount: 0, warningCount: 0 }),
      makeFileResult({ filePath: "/project/src/d.ts", errorCount: 0, warningCount: 0 }),
    ];
    const result = parseEslintOutput(files);
    const metric = result.summary.find((m) => m.descriptor.id === "clean-file-ratio");
    expect(metric?.value).toBe(75);
  });

  it("handles zero files gracefully", () => {
    const result = parseEslintOutput([]);
    const totalFiles = result.summary.find((m) => m.descriptor.id === "total-files-linted");
    expect(totalFiles?.value).toBe(0);
    const ratio = result.summary.find((m) => m.descriptor.id === "clean-file-ratio");
    expect(ratio?.value).toBe(100);
  });

  it("produces per-file measurements with error and warning counts", () => {
    const files = [
      makeFileResult({ filePath: "/project/src/a.ts", errorCount: 2, warningCount: 3 }),
    ];
    const result = parseEslintOutput(files);

    expect(result.files).toHaveLength(1);
    const fileA = result.files[0]!;
    expect(fileA.filePath).toBe("/project/src/a.ts");

    const errorMetric = fileA.metrics.find((m) => m.descriptor.id === "file-error-count");
    expect(errorMetric?.value).toBe(2);

    const warningMetric = fileA.metrics.find((m) => m.descriptor.id === "file-warning-count");
    expect(warningMetric?.value).toBe(3);
  });

  it("produces per-file total issue count", () => {
    const files = [
      makeFileResult({ filePath: "/project/src/a.ts", errorCount: 1, warningCount: 4 }),
    ];
    const result = parseEslintOutput(files);
    const fileA = result.files[0]!;
    const issueMetric = fileA.metrics.find((m) => m.descriptor.id === "file-issue-count");
    expect(issueMetric?.value).toBe(5);
  });

  it("sorts per-file measurements by file path for determinism", () => {
    const files = [
      makeFileResult({ filePath: "/project/src/z.ts" }),
      makeFileResult({ filePath: "/project/src/a.ts" }),
      makeFileResult({ filePath: "/project/src/m.ts" }),
    ];
    const result = parseEslintOutput(files);

    expect(result.files[0]?.filePath).toBe("/project/src/a.ts");
    expect(result.files[1]?.filePath).toBe("/project/src/m.ts");
    expect(result.files[2]?.filePath).toBe("/project/src/z.ts");
  });

  it("produces deterministic output for identical input", () => {
    const files = [
      makeFileResult({ filePath: "/project/src/a.ts", errorCount: 1, warningCount: 2 }),
      makeFileResult({ filePath: "/project/src/b.ts", errorCount: 0, warningCount: 1 }),
    ];
    const result1 = parseEslintOutput(files);
    const result2 = parseEslintOutput(files);
    expect(result1).toEqual(result2);
  });

  it("includes metric metadata with correct units and ranges", () => {
    const result = parseEslintOutput([]);

    const totalErrors = result.summary.find((m) => m.descriptor.id === "total-errors");
    expect(totalErrors?.descriptor.unit).toBe("count");
    expect(totalErrors?.descriptor.min).toBe(0);
    expect(totalErrors?.descriptor.max).toBeNull();

    const ratio = result.summary.find((m) => m.descriptor.id === "clean-file-ratio");
    expect(ratio?.descriptor.unit).toBe("percent");
    expect(ratio?.descriptor.min).toBe(0);
    expect(ratio?.descriptor.max).toBe(100);
  });

  it("only counts files with zero errors AND zero warnings as clean", () => {
    const files = [
      makeFileResult({ filePath: "/project/src/a.ts", errorCount: 0, warningCount: 1 }),
    ];
    const result = parseEslintOutput(files);
    const metric = result.summary.find((m) => m.descriptor.id === "clean-files");
    expect(metric?.value).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// createEslintAdapter — adapter factory
// ---------------------------------------------------------------------------

describe("createEslintAdapter", () => {
  it("reports availability when eslint is found", async () => {
    const execFn: EslintExecFn = async (_args) => ({
      ok: true as const,
      stdout: "v9.0.0",
    });
    const adapter = createEslintAdapter(execFn);
    const availability = await adapter.checkAvailability();
    expect(availability.available).toBe(true);
    if (availability.available) {
      expect(availability.version).toBe("9.0.0");
    }
  });

  it("reports unavailability when eslint is not found", async () => {
    const execFn: EslintExecFn = async () => ({
      ok: false as const,
      error: "command not found",
    });
    const adapter = createEslintAdapter(execFn);
    const availability = await adapter.checkAvailability();
    expect(availability.available).toBe(false);
  });

  it("has id 'eslint' and supports consistency axis", () => {
    const execFn: EslintExecFn = async () => ({ ok: true as const, stdout: "" });
    const adapter = createEslintAdapter(execFn);
    expect(adapter.id).toBe("eslint");
    expect(adapter.supportedAxes).toContain("consistency");
  });

  it("invokes eslint with --format json", async () => {
    const capturedCalls: (readonly string[])[] = [];

    const execFn: EslintExecFn = async (args) => {
      capturedCalls.push(args);
      return { ok: true as const, stdout: "[]" };
    };
    const adapter = createEslintAdapter(execFn);
    const result = await adapter.measure("/project", "consistency");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.axisId).toBe("consistency");
    }

    expect(capturedCalls).toHaveLength(1);
    expect(capturedCalls[0]).toContain("--format");
    expect(capturedCalls[0]).toContain("json");
  });

  it("returns an error when eslint execution fails", async () => {
    const execFn: EslintExecFn = async () => ({
      ok: false as const,
      error: "eslint crashed",
    });
    const adapter = createEslintAdapter(execFn);
    const result = await adapter.measure("/project", "consistency");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.adapterId).toBe("eslint");
      expect(result.error.message).toContain("eslint");
    }
  });

  it("returns an error when JSON output is invalid", async () => {
    const execFn: EslintExecFn = async () => ({
      ok: true as const,
      stdout: "not valid json {{{",
    });
    const adapter = createEslintAdapter(execFn);
    const result = await adapter.measure("/project", "consistency");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.adapterId).toBe("eslint");
      expect(result.error.message).toContain("parse");
    }
  });

  it("parses version from eslint --version output", async () => {
    const execFn: EslintExecFn = async (args) => {
      if (args.includes("--version")) {
        return { ok: true as const, stdout: "v9.5.0\n" };
      }
      return { ok: true as const, stdout: "[]" };
    };
    const adapter = createEslintAdapter(execFn);
    const availability = await adapter.checkAvailability();
    expect(availability.available).toBe(true);
    if (availability.available) {
      expect(availability.version).toBe("9.5.0");
    }
  });

  it("passes target path to eslint invocation", async () => {
    const capturedCalls: (readonly string[])[] = [];

    const execFn: EslintExecFn = async (args) => {
      capturedCalls.push(args);
      return { ok: true as const, stdout: "[]" };
    };
    const adapter = createEslintAdapter(execFn);
    await adapter.measure("/my/project", "consistency");

    expect(capturedCalls[0]).toContain("/my/project");
  });

  it("handles eslint exit code 1 with valid JSON as success (lint issues found)", async () => {
    const lintOutput = JSON.stringify([
      {
        filePath: "/project/src/a.ts",
        messages: [{ ruleId: "no-unused-vars", severity: 2, message: "x is defined but never used" }],
        errorCount: 1,
        warningCount: 0,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
      },
    ]);

    const execFn: EslintExecFn = async () => ({
      ok: true as const,
      stdout: lintOutput,
    });
    const adapter = createEslintAdapter(execFn);
    const result = await adapter.measure("/project", "consistency");

    expect(result.ok).toBe(true);
    if (result.ok) {
      const totalErrors = result.value.summary.find((m) => m.descriptor.id === "total-errors");
      expect(totalErrors?.value).toBe(1);
    }
  });
});
