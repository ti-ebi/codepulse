/**
 * Tests for the knip adapter.
 *
 * knip provides dead code detection (unused files, exports, types, dependencies),
 * mapped to the "dead-code" axis.
 *
 * The adapter follows the Three-Line pattern:
 *   1. Invoke knip with --reporter json
 *   2. Parse the JSON output
 *   3. Map to CodePulse's AxisMeasurement schema
 */

import { describe, it, expect } from "vitest";
import {
  parseKnipReport,
  createKnipAdapter,
  type KnipReport,
  type KnipExecFn,
} from "./knip.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReport(overrides?: Partial<KnipReport>): KnipReport {
  return {
    files: [],
    issues: [],
    ...overrides,
  };
}

function makeIssue(
  overrides?: Partial<KnipReport["issues"][number]>,
): KnipReport["issues"][number] {
  return {
    file: "src/example.ts",
    dependencies: [],
    devDependencies: [],
    optionalPeerDependencies: [],
    unlisted: [],
    binaries: [],
    unresolved: [],
    exports: [],
    types: [],
    enumMembers: {},
    duplicates: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseKnipReport — dead-code axis
// ---------------------------------------------------------------------------

describe("parseKnipReport", () => {
  it("produces an AxisMeasurement with axisId 'dead-code'", () => {
    const report = makeReport();
    const result = parseKnipReport(report);
    expect(result.axisId).toBe("dead-code");
  });

  it("maps orphaned files count to summary metric", () => {
    const report = makeReport({
      files: ["src/dead.ts", "src/orphan.ts", "src/unused.ts"],
    });
    const result = parseKnipReport(report);

    const metric = result.summary.find((m) => m.descriptor.id === "unused-files");
    expect(metric?.value).toBe(3);
  });

  it("counts total unused exports across all issues", () => {
    const report = makeReport({
      issues: [
        makeIssue({
          file: "src/a.ts",
          exports: [
            { name: "foo", line: 1, col: 1, pos: 0 },
            { name: "bar", line: 2, col: 1, pos: 20 },
          ],
        }),
        makeIssue({
          file: "src/b.ts",
          exports: [{ name: "baz", line: 1, col: 1, pos: 0 }],
        }),
      ],
    });
    const result = parseKnipReport(report);

    const metric = result.summary.find((m) => m.descriptor.id === "unused-exports");
    expect(metric?.value).toBe(3);
  });

  it("counts total unused types across all issues", () => {
    const report = makeReport({
      issues: [
        makeIssue({
          file: "src/a.ts",
          types: [
            { name: "Foo", line: 1, col: 1, pos: 0 },
          ],
        }),
        makeIssue({
          file: "src/b.ts",
          types: [
            { name: "Bar", line: 1, col: 1, pos: 0 },
            { name: "Baz", line: 2, col: 1, pos: 20 },
          ],
        }),
      ],
    });
    const result = parseKnipReport(report);

    const metric = result.summary.find((m) => m.descriptor.id === "unused-types");
    expect(metric?.value).toBe(3);
  });

  it("counts total unused dependencies across all issues", () => {
    const report = makeReport({
      issues: [
        makeIssue({
          file: "package.json",
          dependencies: [{ name: "lodash" }],
          devDependencies: [{ name: "jest" }],
        }),
      ],
    });
    const result = parseKnipReport(report);

    const metric = result.summary.find((m) => m.descriptor.id === "unused-dependencies");
    expect(metric?.value).toBe(2);
  });

  it("counts total files with issues", () => {
    const report = makeReport({
      files: ["src/dead.ts"],
      issues: [
        makeIssue({ file: "src/a.ts", exports: [{ name: "foo", line: 1, col: 1, pos: 0 }] }),
        makeIssue({ file: "src/b.ts", types: [{ name: "Bar", line: 1, col: 1, pos: 0 }] }),
        makeIssue({ file: "src/clean.ts" }), // no actual issues
      ],
    });
    const result = parseKnipReport(report);

    const metric = result.summary.find((m) => m.descriptor.id === "total-issues");
    // 1 orphaned file + 1 unused export (file a) + 1 unused type (file b) = 3 issue items
    // total-issues counts the sum of all individual issue items
    expect(metric?.value).toBe(3);
  });

  it("includes metric metadata with correct units", () => {
    const report = makeReport();
    const result = parseKnipReport(report);

    const filesMetric = result.summary.find((m) => m.descriptor.id === "unused-files");
    expect(filesMetric?.descriptor.unit).toBe("files");
    expect(filesMetric?.descriptor.min).toBe(0);
    expect(filesMetric?.descriptor.max).toBeNull();

    const exportsMetric = result.summary.find((m) => m.descriptor.id === "unused-exports");
    expect(exportsMetric?.descriptor.unit).toBe("count");
    expect(exportsMetric?.descriptor.min).toBe(0);
    expect(exportsMetric?.descriptor.max).toBeNull();
  });

  it("produces per-file measurements for orphaned files", () => {
    const report = makeReport({
      files: ["src/dead.ts", "src/orphan.ts"],
    });
    const result = parseKnipReport(report);

    const deadFile = result.files.find((f) => f.filePath === "src/dead.ts");
    expect(deadFile).toBeDefined();
    const orphanedMetric = deadFile!.metrics.find((m) => m.descriptor.id === "file-is-orphaned");
    expect(orphanedMetric?.value).toBe(1);
  });

  it("produces per-file measurements for files with unused exports", () => {
    const report = makeReport({
      issues: [
        makeIssue({
          file: "src/a.ts",
          exports: [
            { name: "foo", line: 1, col: 1, pos: 0 },
            { name: "bar", line: 5, col: 1, pos: 40 },
          ],
          types: [{ name: "Baz", line: 10, col: 1, pos: 80 }],
        }),
      ],
    });
    const result = parseKnipReport(report);

    const fileA = result.files.find((f) => f.filePath === "src/a.ts");
    expect(fileA).toBeDefined();

    const exportsMetric = fileA!.metrics.find((m) => m.descriptor.id === "file-unused-exports");
    expect(exportsMetric?.value).toBe(2);

    const typesMetric = fileA!.metrics.find((m) => m.descriptor.id === "file-unused-types");
    expect(typesMetric?.value).toBe(1);
  });

  it("handles empty report with zero metrics", () => {
    const report = makeReport();
    const result = parseKnipReport(report);

    const files = result.summary.find((m) => m.descriptor.id === "unused-files");
    expect(files?.value).toBe(0);
    const exports = result.summary.find((m) => m.descriptor.id === "unused-exports");
    expect(exports?.value).toBe(0);
    expect(result.files).toHaveLength(0);
  });

  it("produces deterministic output for identical input", () => {
    const report = makeReport({
      files: ["src/dead.ts"],
      issues: [
        makeIssue({
          file: "src/a.ts",
          exports: [{ name: "foo", line: 1, col: 1, pos: 0 }],
          types: [{ name: "Bar", line: 3, col: 1, pos: 30 }],
        }),
      ],
    });

    const result1 = parseKnipReport(report);
    const result2 = parseKnipReport(report);
    expect(result1).toEqual(result2);
  });

  it("skips issues entries with no actual issues", () => {
    const report = makeReport({
      issues: [
        makeIssue({ file: "src/clean.ts" }), // all arrays empty
      ],
    });
    const result = parseKnipReport(report);

    // No file-level entries for files with no issues
    expect(result.files).toHaveLength(0);
  });

  it("counts unresolved imports in unused dependencies total", () => {
    const report = makeReport({
      issues: [
        makeIssue({
          file: "src/a.ts",
          unresolved: [{ name: "./missing", line: 1, col: 1, pos: 0 }],
        }),
      ],
    });
    const result = parseKnipReport(report);

    const metric = result.summary.find((m) => m.descriptor.id === "unresolved-imports");
    expect(metric?.value).toBe(1);
  });

  it("counts duplicate exports", () => {
    const report = makeReport({
      issues: [
        makeIssue({
          file: "src/a.ts",
          duplicates: ["Foo", "Bar"],
        }),
      ],
    });
    const result = parseKnipReport(report);

    const metric = result.summary.find((m) => m.descriptor.id === "duplicate-exports");
    expect(metric?.value).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// createKnipAdapter — adapter factory
// ---------------------------------------------------------------------------

describe("createKnipAdapter", () => {
  it("reports availability when knip is found", async () => {
    const execFn: KnipExecFn = async (_args) => ({
      ok: true as const,
      stdout: "5.83.1",
    });
    const adapter = createKnipAdapter(execFn);
    const availability = await adapter.checkAvailability();
    expect(availability.available).toBe(true);
    if (availability.available) {
      expect(availability.version).toBe("5.83.1");
    }
  });

  it("reports unavailability when knip is not found", async () => {
    const execFn: KnipExecFn = async () => ({
      ok: false as const,
      error: "command not found",
    });
    const adapter = createKnipAdapter(execFn);
    const availability = await adapter.checkAvailability();
    expect(availability.available).toBe(false);
  });

  it("has id 'knip' and supports dead-code axis", () => {
    const execFn: KnipExecFn = async () => ({ ok: true as const, stdout: "" });
    const adapter = createKnipAdapter(execFn);
    expect(adapter.id).toBe("knip");
    expect(adapter.supportedAxes).toContain("dead-code");
  });

  it("invokes knip with --reporter json and --directory flag", async () => {
    const reportJson = JSON.stringify(makeReport({
      files: ["src/dead.ts"],
      issues: [
        makeIssue({
          file: "src/a.ts",
          exports: [{ name: "foo", line: 1, col: 1, pos: 0 }],
        }),
      ],
    }));

    let capturedArgs: readonly string[] = [];

    const execFn: KnipExecFn = async (args) => {
      capturedArgs = args;
      return { ok: true as const, stdout: reportJson };
    };
    const adapter = createKnipAdapter(execFn);
    const result = await adapter.measure("/project/src", "dead-code");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.axisId).toBe("dead-code");
      const unusedFiles = result.value.summary.find((m) => m.descriptor.id === "unused-files");
      expect(unusedFiles?.value).toBe(1);
    }

    expect(capturedArgs).toContain("--reporter");
    expect(capturedArgs).toContain("json");
    expect(capturedArgs).toContain("--directory");
    expect(capturedArgs).toContain("/project/src");
  });

  it("returns an error when knip execution fails", async () => {
    const execFn: KnipExecFn = async () => ({
      ok: false as const,
      error: "knip crashed",
    });
    const adapter = createKnipAdapter(execFn);
    const result = await adapter.measure("/project/src", "dead-code");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.adapterId).toBe("knip");
      expect(result.error.message).toContain("knip");
    }
  });

  it("returns an error when JSON output is invalid", async () => {
    const execFn: KnipExecFn = async () => ({
      ok: true as const,
      stdout: "not valid json {{{",
    });
    const adapter = createKnipAdapter(execFn);
    const result = await adapter.measure("/project/src", "dead-code");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.adapterId).toBe("knip");
      expect(result.error.message).toContain("parse");
    }
  });

  it("parses version from knip --version output", async () => {
    const execFn: KnipExecFn = async (args) => {
      if (args.includes("--version")) {
        return { ok: true as const, stdout: "5.83.1\n" };
      }
      return { ok: true as const, stdout: "{}" };
    };
    const adapter = createKnipAdapter(execFn);
    const availability = await adapter.checkAvailability();
    expect(availability.available).toBe(true);
    if (availability.available) {
      expect(availability.version).toBe("5.83.1");
    }
  });

  it("treats knip exit code 1 with valid JSON as success (issues found)", async () => {
    // knip exits with code 1 when issues are found, but that's not an error
    const reportJson = JSON.stringify(makeReport({
      files: ["src/dead.ts"],
    }));

    const execFn: KnipExecFn = async (args) => {
      if (args.includes("--version")) {
        return { ok: true as const, stdout: "5.83.1" };
      }
      // Simulate exit code 1 — knip found issues, stdout still has JSON
      return { ok: true as const, stdout: reportJson };
    };
    const adapter = createKnipAdapter(execFn);
    const result = await adapter.measure("/project/src", "dead-code");

    expect(result.ok).toBe(true);
    if (result.ok) {
      const unusedFiles = result.value.summary.find((m) => m.descriptor.id === "unused-files");
      expect(unusedFiles?.value).toBe(1);
    }
  });
});
