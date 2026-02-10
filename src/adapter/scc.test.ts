/**
 * Tests for the scc adapter.
 *
 * The scc adapter handles two measurement axes:
 *   - "size" (lines of code, file count)
 *   - "complexity" (cyclomatic complexity per file)
 *
 * Tests use dependency injection to avoid requiring scc to be installed.
 */

import { describe, it, expect } from "vitest";
import {
  createSccAdapter,
  parseSccOutput,
  type SccLanguageEntry,
  type SccFileEntry,
  type SccExecFn,
} from "./scc.js";
import type { AxisId } from "../types/axis.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleFileEntry: SccFileEntry = {
  Language: "TypeScript",
  Filename: "index.ts",
  Location: "/project/src/index.ts",
  Lines: 100,
  Code: 70,
  Comment: 20,
  Blank: 10,
  Complexity: 5,
  Bytes: 2048,
};

const sampleFileEntry2: SccFileEntry = {
  Language: "TypeScript",
  Filename: "utils.ts",
  Location: "/project/src/utils.ts",
  Lines: 50,
  Code: 35,
  Comment: 10,
  Blank: 5,
  Complexity: 3,
  Bytes: 1024,
};

const sampleLanguageEntry: SccLanguageEntry = {
  Name: "TypeScript",
  Lines: 150,
  Code: 105,
  Comment: 30,
  Blank: 15,
  Complexity: 8,
  Count: 2,
  Bytes: 3072,
  Files: [sampleFileEntry, sampleFileEntry2],
};

const multiLanguageOutput: readonly SccLanguageEntry[] = [
  sampleLanguageEntry,
  {
    Name: "JSON",
    Lines: 20,
    Code: 18,
    Comment: 0,
    Blank: 2,
    Complexity: 0,
    Count: 1,
    Bytes: 512,
    Files: [
      {
        Language: "JSON",
        Filename: "package.json",
        Location: "/project/package.json",
        Lines: 20,
        Code: 18,
        Comment: 0,
        Blank: 2,
        Complexity: 0,
        Bytes: 512,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// parseSccOutput — Size axis
// ---------------------------------------------------------------------------

describe("parseSccOutput for size axis", () => {
  it("produces summary metrics with total lines, code lines, file count, comment lines, and blank lines", () => {
    const result = parseSccOutput(multiLanguageOutput, "size");

    expect(result.axisId).toBe("size");

    const summaryIds = result.summary.map((m) => m.descriptor.id);
    expect(summaryIds).toContain("total-lines");
    expect(summaryIds).toContain("code-lines");
    expect(summaryIds).toContain("comment-lines");
    expect(summaryIds).toContain("blank-lines");
    expect(summaryIds).toContain("file-count");
    expect(summaryIds).toContain("total-bytes");
  });

  it("aggregates totals across all languages", () => {
    const result = parseSccOutput(multiLanguageOutput, "size");

    const totalLines = result.summary.find(
      (m) => m.descriptor.id === "total-lines",
    );
    expect(totalLines?.value).toBe(170); // 150 + 20

    const codeLines = result.summary.find(
      (m) => m.descriptor.id === "code-lines",
    );
    expect(codeLines?.value).toBe(123); // 105 + 18

    const fileCount = result.summary.find(
      (m) => m.descriptor.id === "file-count",
    );
    expect(fileCount?.value).toBe(3); // 2 + 1
  });

  it("produces per-file measurements with lines, code, and complexity", () => {
    const result = parseSccOutput(multiLanguageOutput, "size");

    expect(result.files).toHaveLength(3);
    const first = result.files[0]!;
    expect(first.filePath).toBe("/project/src/index.ts");

    const fileLines = first.metrics.find(
      (m) => m.descriptor.id === "total-lines",
    );
    expect(fileLines?.value).toBe(100);

    const fileCode = first.metrics.find(
      (m) => m.descriptor.id === "code-lines",
    );
    expect(fileCode?.value).toBe(70);
  });

  it("sets correct metric metadata", () => {
    const result = parseSccOutput([sampleLanguageEntry], "size");

    const totalLines = result.summary.find(
      (m) => m.descriptor.id === "total-lines",
    );
    expect(totalLines?.descriptor.unit).toBe("lines");
    expect(totalLines?.descriptor.min).toBe(0);
    expect(totalLines?.descriptor.max).toBeNull();
    expect(totalLines?.descriptor.interpretation).toEqual(
      expect.any(String),
    );
  });
});

// ---------------------------------------------------------------------------
// parseSccOutput — Complexity axis
// ---------------------------------------------------------------------------

describe("parseSccOutput for complexity axis", () => {
  it("produces summary metrics with total and average complexity", () => {
    const result = parseSccOutput(multiLanguageOutput, "complexity");

    expect(result.axisId).toBe("complexity");

    const summaryIds = result.summary.map((m) => m.descriptor.id);
    expect(summaryIds).toContain("total-complexity");
    expect(summaryIds).toContain("average-complexity-per-file");
  });

  it("aggregates complexity across all languages", () => {
    const result = parseSccOutput(multiLanguageOutput, "complexity");

    const total = result.summary.find(
      (m) => m.descriptor.id === "total-complexity",
    );
    expect(total?.value).toBe(8); // 8 + 0

    const avg = result.summary.find(
      (m) => m.descriptor.id === "average-complexity-per-file",
    );
    // 8 total complexity / 3 total files ≈ 2.67
    expect(avg?.value).toBeCloseTo(8 / 3, 2);
  });

  it("produces per-file complexity measurements", () => {
    const result = parseSccOutput(multiLanguageOutput, "complexity");

    expect(result.files).toHaveLength(3);
    const first = result.files[0]!;
    expect(first.filePath).toBe("/project/src/index.ts");

    const fileComplexity = first.metrics.find(
      (m) => m.descriptor.id === "cyclomatic-complexity",
    );
    expect(fileComplexity?.value).toBe(5);
  });

  it("includes complexity-per-code-line metric per file", () => {
    const result = parseSccOutput(multiLanguageOutput, "complexity");

    const first = result.files[0]!;
    const perLine = first.metrics.find(
      (m) => m.descriptor.id === "complexity-per-code-line",
    );
    // 5 complexity / 70 code lines ≈ 0.0714
    expect(perLine?.value).toBeCloseTo(5 / 70, 4);
  });
});

// ---------------------------------------------------------------------------
// parseSccOutput — Edge cases
// ---------------------------------------------------------------------------

describe("parseSccOutput edge cases", () => {
  it("handles empty input (no languages)", () => {
    const sizeResult = parseSccOutput([], "size");
    expect(sizeResult.summary.find((m) => m.descriptor.id === "total-lines")?.value).toBe(0);
    expect(sizeResult.files).toHaveLength(0);

    const complexityResult = parseSccOutput([], "complexity");
    expect(complexityResult.summary.find((m) => m.descriptor.id === "total-complexity")?.value).toBe(0);
    expect(complexityResult.files).toHaveLength(0);
  });

  it("handles language entries with no files array", () => {
    const entryNoFiles: SccLanguageEntry = {
      Name: "Markdown",
      Lines: 10,
      Code: 8,
      Comment: 0,
      Blank: 2,
      Complexity: 0,
      Count: 1,
      Bytes: 200,
      Files: [],
    };
    const result = parseSccOutput([entryNoFiles], "size");
    expect(result.summary.find((m) => m.descriptor.id === "total-lines")?.value).toBe(10);
    expect(result.files).toHaveLength(0);
  });

  it("handles files with zero code lines for complexity-per-code-line", () => {
    const zeroCodeFile: SccFileEntry = {
      Language: "Text",
      Filename: "notes.txt",
      Location: "/project/notes.txt",
      Lines: 5,
      Code: 0,
      Comment: 0,
      Blank: 5,
      Complexity: 0,
      Bytes: 50,
    };
    const entry: SccLanguageEntry = {
      Name: "Text",
      Lines: 5,
      Code: 0,
      Comment: 0,
      Blank: 5,
      Complexity: 0,
      Count: 1,
      Bytes: 50,
      Files: [zeroCodeFile],
    };
    const result = parseSccOutput([entry], "complexity");
    const file = result.files[0]!;
    const perLine = file.metrics.find(
      (m) => m.descriptor.id === "complexity-per-code-line",
    );
    expect(perLine?.value).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// createSccAdapter — integration with ToolAdapter interface
// ---------------------------------------------------------------------------

describe("createSccAdapter", () => {
  it("has correct id and toolName", () => {
    const adapter = createSccAdapter();
    expect(adapter.id).toBe("scc");
    expect(adapter.toolName).toBe("scc");
  });

  it("supports complexity and size axes", () => {
    const adapter = createSccAdapter();
    expect(adapter.supportedAxes).toContain("complexity");
    expect(adapter.supportedAxes).toContain("size");
    expect(adapter.supportedAxes).toHaveLength(2);
  });

  it("reports unavailable when execFn returns an error", async () => {
    const execFn: SccExecFn = async () => ({
      ok: false as const,
      error: "scc not found",
    });
    const adapter = createSccAdapter(execFn);
    const availability = await adapter.checkAvailability();
    expect(availability.available).toBe(false);
    if (!availability.available) {
      expect(availability.reason).toContain("scc");
    }
  });

  it("reports available when execFn succeeds with version", async () => {
    const execFn: SccExecFn = async (_args: readonly string[]) => {
      if (_args.includes("--version")) {
        return { ok: true as const, stdout: "scc version 3.4.0" };
      }
      return { ok: true as const, stdout: "[]" };
    };
    const adapter = createSccAdapter(execFn);
    const availability = await adapter.checkAvailability();
    expect(availability.available).toBe(true);
    if (availability.available) {
      expect(availability.version).toBe("3.4.0");
    }
  });

  it("returns measurement result on successful scc run", async () => {
    const sccOutput = JSON.stringify([sampleLanguageEntry]);
    const execFn: SccExecFn = async (_args: readonly string[]) => {
      if (_args.includes("--version")) {
        return { ok: true as const, stdout: "scc version 3.4.0" };
      }
      return { ok: true as const, stdout: sccOutput };
    };
    const adapter = createSccAdapter(execFn);
    const result = await adapter.measure("/project/src", "size");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.axisId).toBe("size");
      expect(result.value.summary.length).toBeGreaterThan(0);
      expect(result.value.files.length).toBeGreaterThan(0);
    }
  });

  it("returns adapter error when scc execution fails", async () => {
    const execFn: SccExecFn = async () => ({
      ok: false as const,
      error: "scc crashed",
    });
    const adapter = createSccAdapter(execFn);
    const result = await adapter.measure("/project/src", "size");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.adapterId).toBe("scc");
      expect(result.error.message).toContain("scc");
    }
  });

  it("returns adapter error when scc output is invalid JSON", async () => {
    const execFn: SccExecFn = async (_args: readonly string[]) => {
      if (_args.includes("--version")) {
        return { ok: true as const, stdout: "scc version 3.4.0" };
      }
      return { ok: true as const, stdout: "not valid json" };
    };
    const adapter = createSccAdapter(execFn);
    const result = await adapter.measure("/project/src", "size");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.adapterId).toBe("scc");
    }
  });

  it("invokes scc with correct arguments for measurement", async () => {
    const capturedArgs: string[][] = [];
    const execFn: SccExecFn = async (args: readonly string[]) => {
      capturedArgs.push([...args]);
      if (args.includes("--version")) {
        return { ok: true as const, stdout: "scc version 3.4.0" };
      }
      return { ok: true as const, stdout: JSON.stringify([sampleLanguageEntry]) };
    };
    const adapter = createSccAdapter(execFn);
    await adapter.measure("/project/src", "size");

    // The measurement call (not the version check) should include
    // --format json, --by-file, and the target path.
    const measureCall = capturedArgs.find(
      (a) => !a.includes("--version"),
    );
    expect(measureCall).toBeDefined();
    expect(measureCall).toContain("--format");
    expect(measureCall).toContain("json");
    expect(measureCall).toContain("--by-file");
    expect(measureCall).toContain("/project/src");
  });
});
