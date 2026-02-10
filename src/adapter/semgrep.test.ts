/**
 * Tests for the Semgrep adapter.
 *
 * Semgrep provides static analysis for security vulnerability patterns
 * across multiple languages, mapped to the "security" axis.
 *
 * The adapter follows the Three-Line pattern:
 *   1. Invoke semgrep --json --config auto <target>
 *   2. Parse the JSON output
 *   3. Map to CodePulse's AxisMeasurement schema
 */

import { describe, it, expect } from "vitest";
import {
  parseSemgrepOutput,
  createSemgrepAdapter,
  type SemgrepResult,
  type SemgrepExecFn,
} from "./semgrep.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFinding(overrides?: Partial<SemgrepResult["results"][number]>): SemgrepResult["results"][number] {
  return {
    check_id: "javascript.lang.security.detect-eval-with-expression",
    path: "/project/src/a.ts",
    start: { line: 10, col: 1 },
    end: { line: 10, col: 30 },
    extra: {
      message: "Detected eval with non-literal argument",
      severity: "ERROR",
      metadata: {},
    },
    ...overrides,
  };
}

function makeReport(findings: SemgrepResult["results"] = [], errors: SemgrepResult["errors"] = []): SemgrepResult {
  return { results: findings, errors };
}

// ---------------------------------------------------------------------------
// parseSemgrepOutput — security axis
// ---------------------------------------------------------------------------

describe("parseSemgrepOutput", () => {
  it("produces an AxisMeasurement with axisId 'security'", () => {
    const result = parseSemgrepOutput(makeReport());
    expect(result.axisId).toBe("security");
  });

  it("counts total findings across all files", () => {
    const report = makeReport([
      makeFinding({ path: "/project/src/a.ts" }),
      makeFinding({ path: "/project/src/a.ts", check_id: "rule-2" }),
      makeFinding({ path: "/project/src/b.ts" }),
    ]);
    const result = parseSemgrepOutput(report);
    const metric = result.summary.find((m) => m.descriptor.id === "total-findings");
    expect(metric?.value).toBe(3);
  });

  it("counts findings by severity — error", () => {
    const report = makeReport([
      makeFinding({ extra: { message: "m", severity: "ERROR", metadata: {} } }),
      makeFinding({ path: "/project/src/b.ts", extra: { message: "m", severity: "WARNING", metadata: {} } }),
    ]);
    const result = parseSemgrepOutput(report);
    const metric = result.summary.find((m) => m.descriptor.id === "error-findings");
    expect(metric?.value).toBe(1);
  });

  it("counts findings by severity — warning", () => {
    const report = makeReport([
      makeFinding({ extra: { message: "m", severity: "WARNING", metadata: {} } }),
      makeFinding({ path: "/project/src/b.ts", extra: { message: "m", severity: "WARNING", metadata: {} } }),
      makeFinding({ path: "/project/src/c.ts", extra: { message: "m", severity: "ERROR", metadata: {} } }),
    ]);
    const result = parseSemgrepOutput(report);
    const metric = result.summary.find((m) => m.descriptor.id === "warning-findings");
    expect(metric?.value).toBe(2);
  });

  it("counts findings by severity — info", () => {
    const report = makeReport([
      makeFinding({ extra: { message: "m", severity: "INFO", metadata: {} } }),
    ]);
    const result = parseSemgrepOutput(report);
    const metric = result.summary.find((m) => m.descriptor.id === "info-findings");
    expect(metric?.value).toBe(1);
  });

  it("counts unique files with findings", () => {
    const report = makeReport([
      makeFinding({ path: "/project/src/a.ts" }),
      makeFinding({ path: "/project/src/a.ts", check_id: "rule-2" }),
      makeFinding({ path: "/project/src/b.ts" }),
    ]);
    const result = parseSemgrepOutput(report);
    const metric = result.summary.find((m) => m.descriptor.id === "files-with-findings");
    expect(metric?.value).toBe(2);
  });

  it("counts unique rules triggered", () => {
    const report = makeReport([
      makeFinding({ check_id: "rule-1", path: "/project/src/a.ts" }),
      makeFinding({ check_id: "rule-1", path: "/project/src/b.ts" }),
      makeFinding({ check_id: "rule-2", path: "/project/src/a.ts" }),
    ]);
    const result = parseSemgrepOutput(report);
    const metric = result.summary.find((m) => m.descriptor.id === "unique-rules-triggered");
    expect(metric?.value).toBe(2);
  });

  it("handles zero findings gracefully", () => {
    const result = parseSemgrepOutput(makeReport());
    const totalFindings = result.summary.find((m) => m.descriptor.id === "total-findings");
    expect(totalFindings?.value).toBe(0);
    const filesWithFindings = result.summary.find((m) => m.descriptor.id === "files-with-findings");
    expect(filesWithFindings?.value).toBe(0);
    expect(result.files).toHaveLength(0);
  });

  it("produces per-file measurements with finding counts", () => {
    const report = makeReport([
      makeFinding({ path: "/project/src/a.ts", extra: { message: "m", severity: "ERROR", metadata: {} } }),
      makeFinding({ path: "/project/src/a.ts", check_id: "rule-2", extra: { message: "m", severity: "WARNING", metadata: {} } }),
    ]);
    const result = parseSemgrepOutput(report);

    expect(result.files).toHaveLength(1);
    const fileA = result.files[0]!;
    expect(fileA.filePath).toBe("/project/src/a.ts");

    const totalMetric = fileA.metrics.find((m) => m.descriptor.id === "file-finding-count");
    expect(totalMetric?.value).toBe(2);

    const errorMetric = fileA.metrics.find((m) => m.descriptor.id === "file-error-count");
    expect(errorMetric?.value).toBe(1);

    const warningMetric = fileA.metrics.find((m) => m.descriptor.id === "file-warning-count");
    expect(warningMetric?.value).toBe(1);
  });

  it("sorts per-file measurements by file path for determinism", () => {
    const report = makeReport([
      makeFinding({ path: "/project/src/z.ts" }),
      makeFinding({ path: "/project/src/a.ts" }),
      makeFinding({ path: "/project/src/m.ts" }),
    ]);
    const result = parseSemgrepOutput(report);

    expect(result.files[0]?.filePath).toBe("/project/src/a.ts");
    expect(result.files[1]?.filePath).toBe("/project/src/m.ts");
    expect(result.files[2]?.filePath).toBe("/project/src/z.ts");
  });

  it("produces deterministic output for identical input", () => {
    const report = makeReport([
      makeFinding({ path: "/project/src/a.ts" }),
      makeFinding({ path: "/project/src/b.ts", check_id: "rule-2" }),
    ]);
    const result1 = parseSemgrepOutput(report);
    const result2 = parseSemgrepOutput(report);
    expect(result1).toEqual(result2);
  });

  it("includes metric metadata with correct units and ranges", () => {
    const result = parseSemgrepOutput(makeReport());

    const totalFindings = result.summary.find((m) => m.descriptor.id === "total-findings");
    expect(totalFindings?.descriptor.unit).toBe("count");
    expect(totalFindings?.descriptor.min).toBe(0);
    expect(totalFindings?.descriptor.max).toBeNull();

    const filesWithFindings = result.summary.find((m) => m.descriptor.id === "files-with-findings");
    expect(filesWithFindings?.descriptor.unit).toBe("files");
    expect(filesWithFindings?.descriptor.min).toBe(0);
    expect(filesWithFindings?.descriptor.max).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createSemgrepAdapter — adapter factory
// ---------------------------------------------------------------------------

describe("createSemgrepAdapter", () => {
  it("reports availability when semgrep is found", async () => {
    const execFn: SemgrepExecFn = async (_args) => ({
      ok: true as const,
      stdout: "1.56.0",
    });
    const adapter = createSemgrepAdapter(execFn);
    const availability = await adapter.checkAvailability();
    expect(availability.available).toBe(true);
    if (availability.available) {
      expect(availability.version).toBe("1.56.0");
    }
  });

  it("reports unavailability when semgrep is not found", async () => {
    const execFn: SemgrepExecFn = async () => ({
      ok: false as const,
      error: "command not found",
    });
    const adapter = createSemgrepAdapter(execFn);
    const availability = await adapter.checkAvailability();
    expect(availability.available).toBe(false);
  });

  it("has id 'semgrep' and supports security axis", () => {
    const execFn: SemgrepExecFn = async () => ({ ok: true as const, stdout: "" });
    const adapter = createSemgrepAdapter(execFn);
    expect(adapter.id).toBe("semgrep");
    expect(adapter.supportedAxes).toContain("security");
  });

  it("invokes semgrep with --json and --config auto", async () => {
    const capturedCalls: (readonly string[])[] = [];

    const execFn: SemgrepExecFn = async (args) => {
      capturedCalls.push(args);
      return { ok: true as const, stdout: JSON.stringify({ results: [], errors: [] }) };
    };
    const adapter = createSemgrepAdapter(execFn);
    const result = await adapter.measure("/project", "security");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.axisId).toBe("security");
    }

    expect(capturedCalls).toHaveLength(1);
    expect(capturedCalls[0]).toContain("--json");
    expect(capturedCalls[0]).toContain("--config");
    expect(capturedCalls[0]).toContain("auto");
  });

  it("passes target path to semgrep invocation", async () => {
    const capturedCalls: (readonly string[])[] = [];

    const execFn: SemgrepExecFn = async (args) => {
      capturedCalls.push(args);
      return { ok: true as const, stdout: JSON.stringify({ results: [], errors: [] }) };
    };
    const adapter = createSemgrepAdapter(execFn);
    await adapter.measure("/my/project", "security");

    expect(capturedCalls[0]).toContain("/my/project");
  });

  it("returns an error when semgrep execution fails", async () => {
    const execFn: SemgrepExecFn = async () => ({
      ok: false as const,
      error: "semgrep crashed",
    });
    const adapter = createSemgrepAdapter(execFn);
    const result = await adapter.measure("/project", "security");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.adapterId).toBe("semgrep");
      expect(result.error.message).toContain("semgrep");
    }
  });

  it("returns an error when JSON output is invalid", async () => {
    const execFn: SemgrepExecFn = async () => ({
      ok: true as const,
      stdout: "not valid json {{{",
    });
    const adapter = createSemgrepAdapter(execFn);
    const result = await adapter.measure("/project", "security");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.adapterId).toBe("semgrep");
      expect(result.error.message).toContain("parse");
    }
  });

  it("parses version from semgrep --version output", async () => {
    const execFn: SemgrepExecFn = async (args) => {
      if (args.includes("--version")) {
        return { ok: true as const, stdout: "1.56.0\n" };
      }
      return { ok: true as const, stdout: JSON.stringify({ results: [], errors: [] }) };
    };
    const adapter = createSemgrepAdapter(execFn);
    const availability = await adapter.checkAvailability();
    expect(availability.available).toBe(true);
    if (availability.available) {
      expect(availability.version).toBe("1.56.0");
    }
  });

  it("handles semgrep output with findings and non-zero exit code as success", async () => {
    const report: SemgrepResult = {
      results: [
        {
          check_id: "javascript.lang.security.detect-eval-with-expression",
          path: "/project/src/a.ts",
          start: { line: 10, col: 1 },
          end: { line: 10, col: 30 },
          extra: {
            message: "Detected eval with non-literal argument",
            severity: "ERROR",
            metadata: {},
          },
        },
      ],
      errors: [],
    };

    const execFn: SemgrepExecFn = async () => ({
      ok: true as const,
      stdout: JSON.stringify(report),
    });
    const adapter = createSemgrepAdapter(execFn);
    const result = await adapter.measure("/project", "security");

    expect(result.ok).toBe(true);
    if (result.ok) {
      const totalFindings = result.value.summary.find((m) => m.descriptor.id === "total-findings");
      expect(totalFindings?.value).toBe(1);
    }
  });
});
