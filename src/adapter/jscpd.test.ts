/**
 * Tests for the jscpd adapter.
 *
 * jscpd provides copy-paste detection, mapped to the "duplication" axis.
 *
 * The adapter follows the Three-Line pattern:
 *   1. Invoke jscpd with --reporters json --output <tmpDir>
 *   2. Parse the jscpd-report.json file
 *   3. Map to CodePulse's AxisMeasurement schema
 */

import { describe, it, expect } from "vitest";
import {
  parseJscpdReport,
  createJscpdAdapter,
  type JscpdReport,
  type JscpdExecFn,
  type JscpdReadFn,
} from "./jscpd.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReport(overrides?: Partial<JscpdReport>): JscpdReport {
  return {
    statistics: {
      formats: {},
      total: {
        lines: 0,
        tokens: 0,
        sources: 0,
        clones: 0,
        duplicatedLines: 0,
        duplicatedTokens: 0,
        percentage: 0,
        percentageTokens: 0,
        newDuplicatedLines: 0,
        newClones: 0,
      },
    },
    duplicates: [],
    ...overrides,
  };
}

function makeSource(overrides?: Partial<JscpdReport["statistics"]["total"]>): JscpdReport["statistics"]["total"] {
  return {
    lines: 100,
    tokens: 800,
    sources: 1,
    clones: 0,
    duplicatedLines: 0,
    duplicatedTokens: 0,
    percentage: 0,
    percentageTokens: 0,
    newDuplicatedLines: 0,
    newClones: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseJscpdReport — duplication axis
// ---------------------------------------------------------------------------

describe("parseJscpdReport", () => {
  it("produces an AxisMeasurement with axisId 'duplication'", () => {
    const report = makeReport();
    const result = parseJscpdReport(report);
    expect(result.axisId).toBe("duplication");
  });

  it("maps total statistics to summary metrics", () => {
    const report = makeReport({
      statistics: {
        formats: {},
        total: {
          lines: 5000,
          tokens: 40000,
          sources: 50,
          clones: 12,
          duplicatedLines: 300,
          duplicatedTokens: 2400,
          percentage: 6.0,
          percentageTokens: 6.0,
          newDuplicatedLines: 0,
          newClones: 0,
        },
      },
    });
    const result = parseJscpdReport(report);

    const findMetric = (id: string) =>
      result.summary.find((m) => m.descriptor.id === id);

    expect(findMetric("total-clones")?.value).toBe(12);
    expect(findMetric("duplicated-lines")?.value).toBe(300);
    expect(findMetric("duplication-percentage")?.value).toBe(6.0);
    expect(findMetric("total-sources")?.value).toBe(50);
    expect(findMetric("total-lines")?.value).toBe(5000);
  });

  it("includes metric metadata with correct units", () => {
    const report = makeReport({
      statistics: {
        formats: {},
        total: makeSource({ clones: 3, duplicatedLines: 50, percentage: 5.0, sources: 10, lines: 1000 }),
      },
    });
    const result = parseJscpdReport(report);

    const pctMetric = result.summary.find((m) => m.descriptor.id === "duplication-percentage");
    expect(pctMetric?.descriptor.unit).toBe("percent");
    expect(pctMetric?.descriptor.min).toBe(0);
    expect(pctMetric?.descriptor.max).toBe(100);

    const clonesMetric = result.summary.find((m) => m.descriptor.id === "total-clones");
    expect(clonesMetric?.descriptor.unit).toBe("count");
    expect(clonesMetric?.descriptor.min).toBe(0);
    expect(clonesMetric?.descriptor.max).toBeNull();
  });

  it("produces per-file measurements from format sources", () => {
    const report = makeReport({
      statistics: {
        formats: {
          typescript: {
            sources: {
              "/project/src/foo.ts": makeSource({
                clones: 2,
                duplicatedLines: 20,
                percentage: 10.0,
                lines: 200,
              }),
              "/project/src/bar.ts": makeSource({
                clones: 0,
                duplicatedLines: 0,
                percentage: 0,
                lines: 100,
              }),
            },
            total: makeSource({
              clones: 2,
              duplicatedLines: 20,
              percentage: 6.67,
              lines: 300,
              sources: 2,
            }),
          },
        },
        total: makeSource({
          clones: 2,
          duplicatedLines: 20,
          percentage: 6.67,
          lines: 300,
          sources: 2,
        }),
      },
    });

    const result = parseJscpdReport(report);
    expect(result.files).toHaveLength(2);

    const fooFile = result.files.find((f) => f.filePath === "/project/src/foo.ts");
    expect(fooFile).toBeDefined();
    const fooClones = fooFile!.metrics.find((m) => m.descriptor.id === "file-clones");
    expect(fooClones?.value).toBe(2);
    const fooPct = fooFile!.metrics.find((m) => m.descriptor.id === "file-duplication-percentage");
    expect(fooPct?.value).toBe(10.0);
    const fooDupLines = fooFile!.metrics.find((m) => m.descriptor.id === "file-duplicated-lines");
    expect(fooDupLines?.value).toBe(20);
  });

  it("aggregates files across multiple formats", () => {
    const report = makeReport({
      statistics: {
        formats: {
          typescript: {
            sources: {
              "/project/src/a.ts": makeSource({ clones: 1, percentage: 5.0 }),
            },
            total: makeSource(),
          },
          javascript: {
            sources: {
              "/project/src/b.js": makeSource({ clones: 2, percentage: 8.0 }),
            },
            total: makeSource(),
          },
        },
        total: makeSource({ clones: 3 }),
      },
    });

    const result = parseJscpdReport(report);
    expect(result.files).toHaveLength(2);

    const filePaths = result.files.map((f) => f.filePath);
    expect(filePaths).toContain("/project/src/a.ts");
    expect(filePaths).toContain("/project/src/b.js");
  });

  it("handles empty report with zero metrics", () => {
    const report = makeReport();
    const result = parseJscpdReport(report);

    const clones = result.summary.find((m) => m.descriptor.id === "total-clones");
    expect(clones?.value).toBe(0);
    expect(result.files).toHaveLength(0);
  });

  it("produces deterministic output for identical input", () => {
    const report = makeReport({
      statistics: {
        formats: {
          typescript: {
            sources: {
              "/project/src/a.ts": makeSource({ clones: 3, percentage: 15.0 }),
            },
            total: makeSource({ clones: 3, percentage: 15.0 }),
          },
        },
        total: makeSource({ clones: 3, percentage: 15.0 }),
      },
    });

    const result1 = parseJscpdReport(report);
    const result2 = parseJscpdReport(report);
    expect(result1).toEqual(result2);
  });
});

// ---------------------------------------------------------------------------
// createJscpdAdapter — adapter factory
// ---------------------------------------------------------------------------

describe("createJscpdAdapter", () => {
  it("reports availability when jscpd is found", async () => {
    const execFn: JscpdExecFn = async (_args) => ({
      ok: true as const,
      stdout: "4.0.8",
    });
    const readFn: JscpdReadFn = async () => "";
    const adapter = createJscpdAdapter(execFn, readFn);
    const availability = await adapter.checkAvailability();
    expect(availability.available).toBe(true);
    if (availability.available) {
      expect(availability.version).toBe("4.0.8");
    }
  });

  it("reports unavailability when jscpd is not found", async () => {
    const execFn: JscpdExecFn = async () => ({
      ok: false as const,
      error: "command not found",
    });
    const readFn: JscpdReadFn = async () => "";
    const adapter = createJscpdAdapter(execFn, readFn);
    const availability = await adapter.checkAvailability();
    expect(availability.available).toBe(false);
  });

  it("has id 'jscpd' and supports duplication axis", () => {
    const execFn: JscpdExecFn = async () => ({ ok: true as const, stdout: "" });
    const readFn: JscpdReadFn = async () => "";
    const adapter = createJscpdAdapter(execFn, readFn);
    expect(adapter.id).toBe("jscpd");
    expect(adapter.supportedAxes).toContain("duplication");
  });

  it("invokes jscpd and reads the JSON report file", async () => {
    const reportJson = JSON.stringify(makeReport({
      statistics: {
        formats: {},
        total: makeSource({ clones: 5, duplicatedLines: 100, percentage: 10.0, sources: 20, lines: 1000 }),
      },
    }));

    let capturedExecArgs: readonly string[] = [];
    let capturedReadPath = "";

    const execFn: JscpdExecFn = async (args) => {
      capturedExecArgs = args;
      return { ok: true as const, stdout: "" };
    };
    const readFn: JscpdReadFn = async (path) => {
      capturedReadPath = path;
      return reportJson;
    };
    const adapter = createJscpdAdapter(execFn, readFn);
    const result = await adapter.measure("/project/src", "duplication");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.axisId).toBe("duplication");
      const clones = result.value.summary.find((m) => m.descriptor.id === "total-clones");
      expect(clones?.value).toBe(5);
    }

    // Verify invocation included --reporters json and --output
    expect(capturedExecArgs).toContain("--reporters");
    expect(capturedExecArgs).toContain("json");
    expect(capturedExecArgs).toContain("--output");
    expect(capturedExecArgs).toContain("/project/src");

    // Verify the read path ends with jscpd-report.json
    expect(capturedReadPath).toContain("jscpd-report.json");
  });

  it("returns an error when jscpd execution fails", async () => {
    const execFn: JscpdExecFn = async () => ({
      ok: false as const,
      error: "jscpd crashed",
    });
    const readFn: JscpdReadFn = async () => "";
    const adapter = createJscpdAdapter(execFn, readFn);
    const result = await adapter.measure("/project/src", "duplication");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.adapterId).toBe("jscpd");
      expect(result.error.message).toContain("jscpd");
    }
  });

  it("returns an error when JSON report cannot be read", async () => {
    const execFn: JscpdExecFn = async () => ({
      ok: true as const,
      stdout: "",
    });
    const readFn: JscpdReadFn = async () => {
      throw new Error("ENOENT: no such file");
    };
    const adapter = createJscpdAdapter(execFn, readFn);
    const result = await adapter.measure("/project/src", "duplication");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.adapterId).toBe("jscpd");
    }
  });

  it("returns an error when JSON report contains invalid JSON", async () => {
    const execFn: JscpdExecFn = async () => ({
      ok: true as const,
      stdout: "",
    });
    const readFn: JscpdReadFn = async () => "not valid json {{{";
    const adapter = createJscpdAdapter(execFn, readFn);
    const result = await adapter.measure("/project/src", "duplication");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.adapterId).toBe("jscpd");
      expect(result.error.message).toContain("parse");
    }
  });

  it("parses version from jscpd --version output", async () => {
    const execFn: JscpdExecFn = async (args) => {
      if (args.includes("--version")) {
        return { ok: true as const, stdout: "4.0.8\n" };
      }
      return { ok: true as const, stdout: "" };
    };
    const readFn: JscpdReadFn = async () => "";
    const adapter = createJscpdAdapter(execFn, readFn);
    const availability = await adapter.checkAvailability();
    expect(availability.available).toBe(true);
    if (availability.available) {
      expect(availability.version).toBe("4.0.8");
    }
  });
});
