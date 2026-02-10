/**
 * Tests for the CLI runner.
 *
 * The runner wires together parsing, orchestration, and formatting.
 * It uses injected dependencies (stdout, stderr, registry) so tests
 * remain deterministic without touching real I/O.
 */

import { describe, it, expect, vi } from "vitest";
import { run, type CliDeps } from "./run.js";
import { AdapterRegistry } from "../adapter/registry.js";
import type { ToolAdapter } from "../adapter/adapter.js";
import type { AxisId } from "../types/axis.js";
import { ok } from "../types/result.js";
import type { AxisMeasurement } from "../types/measurement.js";

function createMockAdapter(
  id: string,
  axes: AxisId[],
  measurement: AxisMeasurement,
): ToolAdapter {
  return {
    id,
    toolName: `mock-${id}`,
    supportedAxes: axes,
    checkAvailability: async () => ({ available: true as const, version: "1.0.0" }),
    measure: async () => ok(measurement),
  };
}

function createTestDeps(overrides?: Partial<CliDeps>): CliDeps & {
  stdoutLines: string[];
  stderrLines: string[];
} {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  return {
    stdoutLines,
    stderrLines,
    stdout: (text: string) => { stdoutLines.push(text); },
    stderr: (text: string) => { stderrLines.push(text); },
    registry: new AdapterRegistry(),
    timestampFn: () => "2025-01-15T10:00:00.000Z",
    ...overrides,
  };
}

const sizeMeasurement: AxisMeasurement = {
  axisId: "size",
  summary: [
    {
      descriptor: {
        id: "total-lines",
        name: "Total Lines",
        unit: "lines",
        min: 0,
        max: null,
        interpretation: "Total number of lines across all files",
      },
      value: 500,
    },
  ],
  files: [],
};

describe("run", () => {
  it("returns exit code 0 and outputs formatted report on success", async () => {
    const deps = createTestDeps();
    deps.registry.register(createMockAdapter("scc", ["size"], sizeMeasurement));

    const exitCode = await run(
      ["--format", "json", "--axis", "size", "/project"],
      deps,
    );

    expect(exitCode).toBe(0);
    expect(deps.stdoutLines.length).toBe(1);
    const output = JSON.parse(deps.stdoutLines[0]!);
    expect(output.targetPath).toBe("/project");
    expect(output.axes[0].axisId).toBe("size");
  });

  it("returns exit code 1 and prints error when no target path given", async () => {
    const deps = createTestDeps();

    const exitCode = await run([], deps);

    expect(exitCode).toBe(1);
    expect(deps.stderrLines.length).toBeGreaterThan(0);
    expect(deps.stderrLines[0]).toContain("target path");
  });

  it("returns exit code 0 and prints help when --help is passed", async () => {
    const deps = createTestDeps();

    const exitCode = await run(["--help"], deps);

    expect(exitCode).toBe(0);
    expect(deps.stdoutLines.length).toBe(1);
    expect(deps.stdoutLines[0]).toContain("Usage:");
  });

  it("returns exit code 0 and prints version when --version is passed", async () => {
    const deps = createTestDeps();

    const exitCode = await run(["--version"], deps);

    expect(exitCode).toBe(0);
    expect(deps.stdoutLines.length).toBe(1);
    expect(deps.stdoutLines[0]).toContain("codepulse");
  });

  it("returns exit code 1 when orchestration fails", async () => {
    const deps = createTestDeps();
    // No adapters registered, but requesting a specific axis -> orchestration error.

    const exitCode = await run(
      ["--axis", "complexity", "/project"],
      deps,
    );

    expect(exitCode).toBe(1);
    expect(deps.stderrLines.length).toBeGreaterThan(0);
  });

  it("uses terminal-compact formatter by default", async () => {
    const deps = createTestDeps();
    deps.registry.register(createMockAdapter("scc", ["size"], sizeMeasurement));

    const exitCode = await run(
      ["--axis", "size", "/project"],
      deps,
    );

    expect(exitCode).toBe(0);
    // terminal-compact output contains a table-like format, not JSON
    const output = deps.stdoutLines[0]!;
    expect(() => JSON.parse(output)).toThrow(); // Not JSON
    expect(output).toContain("Size"); // Contains axis info
  });

  it("selects terminal-rich formatter when specified", async () => {
    const deps = createTestDeps();
    deps.registry.register(createMockAdapter("scc", ["size"], sizeMeasurement));

    const exitCode = await run(
      ["--format", "terminal-rich", "--axis", "size", "/project"],
      deps,
    );

    expect(exitCode).toBe(0);
    const output = deps.stdoutLines[0]!;
    expect(output).toContain("Size"); // Rich format uses the display name
  });

  it("writes output to file via writeFn when --output is specified", async () => {
    const written: { path: string; content: string }[] = [];
    const deps = createTestDeps({
      writeFn: async (path: string, content: string) => {
        written.push({ path, content });
      },
    });
    deps.registry.register(createMockAdapter("scc", ["size"], sizeMeasurement));

    const exitCode = await run(
      ["--format", "json", "--axis", "size", "--output", "/tmp/report.json", "/project"],
      deps,
    );

    expect(exitCode).toBe(0);
    expect(written.length).toBe(1);
    expect(written[0]!.path).toBe("/tmp/report.json");
    const parsed = JSON.parse(written[0]!.content);
    expect(parsed.targetPath).toBe("/project");
    // stdout should still confirm file was written
    expect(deps.stdoutLines[0]).toContain("/tmp/report.json");
  });

  it("returns exit code 1 and reports error when writeFn throws", async () => {
    const deps = createTestDeps({
      writeFn: async () => {
        throw new Error("EACCES: permission denied");
      },
    });
    deps.registry.register(createMockAdapter("scc", ["size"], sizeMeasurement));

    const exitCode = await run(
      ["--format", "json", "--axis", "size", "--output", "/readonly/report.json", "/project"],
      deps,
    );

    expect(exitCode).toBe(1);
    expect(deps.stderrLines.length).toBeGreaterThan(0);
    expect(deps.stderrLines[0]).toContain("permission denied");
  });

  it("starts MCP server when --mcp is passed", async () => {
    let mcpStarted = false;
    const deps = createTestDeps({
      startMcpServer: async () => {
        mcpStarted = true;
      },
    });

    const exitCode = await run(["--mcp"], deps);

    expect(exitCode).toBe(0);
    expect(mcpStarted).toBe(true);
  });

  it("returns exit code 1 when --mcp is passed but server is unavailable", async () => {
    const deps = createTestDeps();
    // No startMcpServer provided

    const exitCode = await run(["--mcp"], deps);

    expect(exitCode).toBe(1);
    expect(deps.stderrLines.length).toBeGreaterThan(0);
  });

  it("returns exit code 1 when target path does not exist", async () => {
    const deps = createTestDeps({
      statFn: async () => { throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); },
    });
    deps.registry.register(createMockAdapter("scc", ["size"], sizeMeasurement));

    const exitCode = await run(
      ["--axis", "size", "/nonexistent/path"],
      deps,
    );

    expect(exitCode).toBe(1);
    expect(deps.stderrLines.length).toBeGreaterThan(0);
    expect(deps.stderrLines[0]).toContain("does not exist");
  });

  it("returns exit code 1 when target path is a file, not a directory", async () => {
    const deps = createTestDeps({
      statFn: async () => ({ isDirectory: false }),
    });
    deps.registry.register(createMockAdapter("scc", ["size"], sizeMeasurement));

    const exitCode = await run(
      ["--axis", "size", "/some/file.ts"],
      deps,
    );

    expect(exitCode).toBe(1);
    expect(deps.stderrLines.length).toBeGreaterThan(0);
    expect(deps.stderrLines[0]).toContain("not a directory");
  });

  it("proceeds normally when target path is a valid directory", async () => {
    const deps = createTestDeps({
      statFn: async () => ({ isDirectory: true }),
    });
    deps.registry.register(createMockAdapter("scc", ["size"], sizeMeasurement));

    const exitCode = await run(
      ["--format", "json", "--axis", "size", "/valid/project"],
      deps,
    );

    expect(exitCode).toBe(0);
    expect(deps.stdoutLines.length).toBe(1);
    const output = JSON.parse(deps.stdoutLines[0]!);
    expect(output.targetPath).toBe("/valid/project");
  });

  it("skips target path validation when statFn is not provided", async () => {
    const deps = createTestDeps();
    // No statFn — validation is skipped, orchestration proceeds
    deps.registry.register(createMockAdapter("scc", ["size"], sizeMeasurement));

    const exitCode = await run(
      ["--format", "json", "--axis", "size", "/any/path"],
      deps,
    );

    expect(exitCode).toBe(0);
  });

  it("returns exit code 0 and prints axes when --list-axes is passed", async () => {
    const deps = createTestDeps();

    const exitCode = await run(["--list-axes"], deps);

    expect(exitCode).toBe(0);
    expect(deps.stdoutLines.length).toBe(1);
    expect(deps.stdoutLines[0]).toContain("complexity");
    expect(deps.stdoutLines[0]).toContain("size");
  });

  it("suppresses ANSI color codes when --no-color is passed", async () => {
    const boundedMeasurement: AxisMeasurement = {
      axisId: "duplication",
      summary: [
        {
          descriptor: {
            id: "duplication_percent",
            name: "Duplication",
            unit: "percent",
            min: 0,
            max: 100,
            interpretation: "Percentage of code that is duplicated",
          },
          value: 50,
        },
      ],
      files: [],
    };
    const deps = createTestDeps();
    deps.registry.register(createMockAdapter("jscpd", ["duplication"], boundedMeasurement));

    const exitCode = await run(
      ["--axis", "duplication", "--no-color", "/project"],
      deps,
    );

    expect(exitCode).toBe(0);
    const output = deps.stdoutLines[0]!;
    expect(output).not.toMatch(/\x1b\[\d+m/);
    expect(output).toContain("50");
  });

  it("suppresses ANSI color codes when noColorEnv is set in deps", async () => {
    const boundedMeasurement: AxisMeasurement = {
      axisId: "duplication",
      summary: [
        {
          descriptor: {
            id: "duplication_percent",
            name: "Duplication",
            unit: "percent",
            min: 0,
            max: 100,
            interpretation: "Percentage of code that is duplicated",
          },
          value: 50,
        },
      ],
      files: [],
    };
    const deps = createTestDeps({ noColorEnv: true });
    deps.registry.register(createMockAdapter("jscpd", ["duplication"], boundedMeasurement));

    const exitCode = await run(
      ["--axis", "duplication", "/project"],
      deps,
    );

    expect(exitCode).toBe(0);
    const output = deps.stdoutLines[0]!;
    expect(output).not.toMatch(/\x1b\[\d+m/);
    expect(output).toContain("50");
  });

  it("allows colors when noColorEnv is false and --no-color is not passed", async () => {
    const boundedMeasurement: AxisMeasurement = {
      axisId: "duplication",
      summary: [
        {
          descriptor: {
            id: "duplication_percent",
            name: "Duplication",
            unit: "percent",
            min: 0,
            max: 100,
            interpretation: "Percentage of code that is duplicated",
          },
          value: 50,
        },
      ],
      files: [],
    };
    const deps = createTestDeps({ noColorEnv: false });
    deps.registry.register(createMockAdapter("jscpd", ["duplication"], boundedMeasurement));

    const exitCode = await run(
      ["--axis", "duplication", "/project"],
      deps,
    );

    expect(exitCode).toBe(0);
    const output = deps.stdoutLines[0]!;
    expect(output).toMatch(/\x1b\[\d+m/);
  });

  it("limits per-axis file results when --top is specified", async () => {
    const measurementWithFiles: AxisMeasurement = {
      axisId: "size",
      summary: [
        {
          descriptor: {
            id: "total-lines",
            name: "Total Lines",
            unit: "lines",
            min: 0,
            max: null,
            interpretation: "Total number of lines across all files",
          },
          value: 500,
        },
      ],
      files: [
        { filePath: "/project/a.ts", metrics: [] },
        { filePath: "/project/b.ts", metrics: [] },
        { filePath: "/project/c.ts", metrics: [] },
        { filePath: "/project/d.ts", metrics: [] },
        { filePath: "/project/e.ts", metrics: [] },
      ],
    };
    const deps = createTestDeps();
    deps.registry.register(createMockAdapter("scc", ["size"], measurementWithFiles));

    const exitCode = await run(
      ["--format", "json", "--axis", "size", "--top", "2", "/project"],
      deps,
    );

    expect(exitCode).toBe(0);
    const output = JSON.parse(deps.stdoutLines[0]!);
    expect(output.axes[0].files).toHaveLength(2);
    expect(output.axes[0].files[0].filePath).toBe("/project/a.ts");
    expect(output.axes[0].files[1].filePath).toBe("/project/b.ts");
  });

  it("does not limit files when --top is not specified", async () => {
    const measurementWithFiles: AxisMeasurement = {
      axisId: "size",
      summary: [],
      files: [
        { filePath: "/project/a.ts", metrics: [] },
        { filePath: "/project/b.ts", metrics: [] },
        { filePath: "/project/c.ts", metrics: [] },
      ],
    };
    const deps = createTestDeps();
    deps.registry.register(createMockAdapter("scc", ["size"], measurementWithFiles));

    const exitCode = await run(
      ["--format", "json", "--axis", "size", "/project"],
      deps,
    );

    expect(exitCode).toBe(0);
    const output = JSON.parse(deps.stdoutLines[0]!);
    expect(output.axes[0].files).toHaveLength(3);
  });

  it("includes fileTotalCount when --top truncates file results", async () => {
    const measurementWithFiles: AxisMeasurement = {
      axisId: "size",
      summary: [],
      files: [
        { filePath: "/project/a.ts", metrics: [] },
        { filePath: "/project/b.ts", metrics: [] },
        { filePath: "/project/c.ts", metrics: [] },
        { filePath: "/project/d.ts", metrics: [] },
        { filePath: "/project/e.ts", metrics: [] },
      ],
    };
    const deps = createTestDeps();
    deps.registry.register(createMockAdapter("scc", ["size"], measurementWithFiles));

    const exitCode = await run(
      ["--format", "json", "--axis", "size", "--top", "2", "/project"],
      deps,
    );

    expect(exitCode).toBe(0);
    const output = JSON.parse(deps.stdoutLines[0]!);
    expect(output.axes[0].files).toHaveLength(2);
    expect(output.axes[0].fileTotalCount).toBe(5);
  });

  it("does not include fileTotalCount when --top does not truncate", async () => {
    const measurementWithFiles: AxisMeasurement = {
      axisId: "size",
      summary: [],
      files: [
        { filePath: "/project/a.ts", metrics: [] },
        { filePath: "/project/b.ts", metrics: [] },
      ],
    };
    const deps = createTestDeps();
    deps.registry.register(createMockAdapter("scc", ["size"], measurementWithFiles));

    const exitCode = await run(
      ["--format", "json", "--axis", "size", "--top", "5", "/project"],
      deps,
    );

    expect(exitCode).toBe(0);
    const output = JSON.parse(deps.stdoutLines[0]!);
    expect(output.axes[0].files).toHaveLength(2);
    expect(output.axes[0].fileTotalCount).toBeUndefined();
  });

  it("sorts file-level results by specified metric descending when --sort is used", async () => {
    const measurementWithFiles: AxisMeasurement = {
      axisId: "size",
      summary: [
        {
          descriptor: {
            id: "total-lines",
            name: "Total Lines",
            unit: "lines",
            min: 0,
            max: null,
            interpretation: "Total number of lines across all files",
          },
          value: 500,
        },
      ],
      files: [
        {
          filePath: "/project/small.ts",
          metrics: [
            {
              descriptor: {
                id: "code-lines",
                name: "Code Lines",
                unit: "lines",
                min: 0,
                max: null,
                interpretation: "Lines of code in the file",
              },
              value: 10,
            },
          ],
        },
        {
          filePath: "/project/large.ts",
          metrics: [
            {
              descriptor: {
                id: "code-lines",
                name: "Code Lines",
                unit: "lines",
                min: 0,
                max: null,
                interpretation: "Lines of code in the file",
              },
              value: 500,
            },
          ],
        },
        {
          filePath: "/project/medium.ts",
          metrics: [
            {
              descriptor: {
                id: "code-lines",
                name: "Code Lines",
                unit: "lines",
                min: 0,
                max: null,
                interpretation: "Lines of code in the file",
              },
              value: 100,
            },
          ],
        },
      ],
    };
    const deps = createTestDeps();
    deps.registry.register(createMockAdapter("scc", ["size"], measurementWithFiles));

    const exitCode = await run(
      ["--format", "json", "--axis", "size", "--sort", "code-lines", "/project"],
      deps,
    );

    expect(exitCode).toBe(0);
    const output = JSON.parse(deps.stdoutLines[0]!);
    expect(output.axes[0].files).toHaveLength(3);
    expect(output.axes[0].files[0].filePath).toBe("/project/large.ts");
    expect(output.axes[0].files[1].filePath).toBe("/project/medium.ts");
    expect(output.axes[0].files[2].filePath).toBe("/project/small.ts");
  });

  it("sorts files before applying --top truncation", async () => {
    const measurementWithFiles: AxisMeasurement = {
      axisId: "size",
      summary: [],
      files: [
        {
          filePath: "/project/small.ts",
          metrics: [
            {
              descriptor: {
                id: "code-lines",
                name: "Code Lines",
                unit: "lines",
                min: 0,
                max: null,
                interpretation: "Lines of code in the file",
              },
              value: 10,
            },
          ],
        },
        {
          filePath: "/project/large.ts",
          metrics: [
            {
              descriptor: {
                id: "code-lines",
                name: "Code Lines",
                unit: "lines",
                min: 0,
                max: null,
                interpretation: "Lines of code in the file",
              },
              value: 500,
            },
          ],
        },
        {
          filePath: "/project/medium.ts",
          metrics: [
            {
              descriptor: {
                id: "code-lines",
                name: "Code Lines",
                unit: "lines",
                min: 0,
                max: null,
                interpretation: "Lines of code in the file",
              },
              value: 100,
            },
          ],
        },
      ],
    };
    const deps = createTestDeps();
    deps.registry.register(createMockAdapter("scc", ["size"], measurementWithFiles));

    const exitCode = await run(
      ["--format", "json", "--axis", "size", "--sort", "code-lines", "--top", "2", "/project"],
      deps,
    );

    expect(exitCode).toBe(0);
    const output = JSON.parse(deps.stdoutLines[0]!);
    expect(output.axes[0].files).toHaveLength(2);
    expect(output.axes[0].files[0].filePath).toBe("/project/large.ts");
    expect(output.axes[0].files[1].filePath).toBe("/project/medium.ts");
    expect(output.axes[0].fileTotalCount).toBe(3);
  });

  it("preserves original order when --sort metric is not found in file metrics", async () => {
    const measurementWithFiles: AxisMeasurement = {
      axisId: "size",
      summary: [],
      files: [
        { filePath: "/project/a.ts", metrics: [] },
        { filePath: "/project/b.ts", metrics: [] },
        { filePath: "/project/c.ts", metrics: [] },
      ],
    };
    const deps = createTestDeps();
    deps.registry.register(createMockAdapter("scc", ["size"], measurementWithFiles));

    const exitCode = await run(
      ["--format", "json", "--axis", "size", "--sort", "nonexistent-metric", "/project"],
      deps,
    );

    expect(exitCode).toBe(0);
    const output = JSON.parse(deps.stdoutLines[0]!);
    expect(output.axes[0].files[0].filePath).toBe("/project/a.ts");
    expect(output.axes[0].files[1].filePath).toBe("/project/b.ts");
    expect(output.axes[0].files[2].filePath).toBe("/project/c.ts");
  });

  it("suppresses colors when both --no-color and noColorEnv are set", async () => {
    const boundedMeasurement: AxisMeasurement = {
      axisId: "duplication",
      summary: [
        {
          descriptor: {
            id: "duplication_percent",
            name: "Duplication",
            unit: "percent",
            min: 0,
            max: 100,
            interpretation: "Percentage of code that is duplicated",
          },
          value: 50,
        },
      ],
      files: [],
    };
    const deps = createTestDeps({ noColorEnv: true });
    deps.registry.register(createMockAdapter("jscpd", ["duplication"], boundedMeasurement));

    const exitCode = await run(
      ["--axis", "duplication", "--no-color", "/project"],
      deps,
    );

    expect(exitCode).toBe(0);
    const output = deps.stdoutLines[0]!;
    expect(output).not.toMatch(/\x1b\[\d+m/);
    expect(output).toContain("50");
  });
});
