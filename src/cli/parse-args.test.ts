/**
 * Tests for CLI argument parsing.
 *
 * The argument parser translates process.argv-style string arrays
 * into a validated MeasurementConfig or returns a structured error.
 */

import { describe, it, expect } from "vitest";
import { parseArgs, type ParseResult } from "./parse-args.js";

describe("parseArgs", () => {
  describe("target path", () => {
    it("extracts a positional target path", () => {
      const result = parseArgs(["/path/to/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.targetPath).toBe("/path/to/project");
    });

    it("returns an error when no target path is provided", () => {
      const result = parseArgs([]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain("target path");
    });
  });

  describe("--format flag", () => {
    it("defaults to terminal-compact when no format is specified", () => {
      const result = parseArgs(["/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.outputFormat).toBe("terminal-compact");
    });

    it("accepts --format json", () => {
      const result = parseArgs(["--format", "json", "/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.outputFormat).toBe("json");
    });

    it("accepts --format terminal-rich", () => {
      const result = parseArgs(["--format", "terminal-rich", "/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.outputFormat).toBe("terminal-rich");
    });

    it("accepts --format terminal-compact", () => {
      const result = parseArgs(["--format", "terminal-compact", "/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.outputFormat).toBe("terminal-compact");
    });

    it("accepts --format html", () => {
      const result = parseArgs(["--format", "html", "/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.outputFormat).toBe("html");
    });

    it("returns an error for unknown format", () => {
      const result = parseArgs(["--format", "xml", "/project"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain("xml");
    });

    it("returns an error when --format is last with no value", () => {
      const result = parseArgs(["/project", "--format"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("error");
      expect(result.error.message).toContain("--format requires a value");
    });
  });

  describe("--axis flag", () => {
    it("defaults to empty array (measure all) when no axes specified", () => {
      const result = parseArgs(["/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.axes).toEqual([]);
    });

    it("accepts a single --axis flag", () => {
      const result = parseArgs(["--axis", "complexity", "/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.axes).toEqual(["complexity"]);
    });

    it("accepts multiple --axis flags", () => {
      const result = parseArgs([
        "--axis", "complexity",
        "--axis", "size",
        "/project",
      ]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.axes).toEqual(["complexity", "size"]);
    });

    it("returns an error for unknown axis", () => {
      const result = parseArgs(["--axis", "magic", "/project"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain("magic");
    });

    it("deduplicates repeated axes", () => {
      const result = parseArgs([
        "--axis", "complexity",
        "--axis", "complexity",
        "--axis", "size",
        "/project",
      ]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.axes).toEqual(["complexity", "size"]);
    });

    it("returns an error when --axis is last with no value", () => {
      const result = parseArgs(["/project", "--axis"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("error");
      expect(result.error.message).toContain("--axis requires a value");
    });
  });

  describe("--output flag", () => {
    it("defaults to undefined when no output path is specified", () => {
      const result = parseArgs(["/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.outputPath).toBeUndefined();
    });

    it("accepts --output with a file path", () => {
      const result = parseArgs(["--output", "/tmp/report.json", "/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.outputPath).toBe("/tmp/report.json");
    });

    it("returns an error when --output is last with no value", () => {
      const result = parseArgs(["/project", "--output"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("error");
      expect(result.error.message).toContain("--output requires a value");
    });

    it("infers json format from .json output extension", () => {
      const result = parseArgs(["--output", "/tmp/report.json", "/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.outputFormat).toBe("json");
    });

    it("infers html format from .html output extension", () => {
      const result = parseArgs(["--output", "/tmp/report.html", "/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.outputFormat).toBe("html");
    });

    it("keeps default format for unrecognized output extension", () => {
      const result = parseArgs(["--output", "/tmp/report.txt", "/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.outputFormat).toBe("terminal-compact");
    });

    it("does not infer format when --format is explicitly provided", () => {
      const result = parseArgs(["--format", "terminal-rich", "--output", "/tmp/report.json", "/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.outputFormat).toBe("terminal-rich");
    });

    it("infers html format from .htm output extension", () => {
      const result = parseArgs(["--output", "/tmp/report.htm", "/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.outputFormat).toBe("html");
    });
  });

  describe("--help flag", () => {
    it("returns a help result when --help is passed", () => {
      const result = parseArgs(["--help"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("help");
    });

    it("returns help even with other arguments", () => {
      const result = parseArgs(["--format", "json", "--help", "/project"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("help");
    });
  });

  describe("--version flag", () => {
    it("returns a version result when --version is passed", () => {
      const result = parseArgs(["--version"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("version");
    });
  });

  describe("thresholds", () => {
    it("defaults to empty thresholds array", () => {
      const result = parseArgs(["/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.thresholds).toEqual([]);
    });
  });

  describe("flag ordering", () => {
    it("handles flags before and after the target path", () => {
      const result = parseArgs([
        "--format", "json",
        "/project",
        "--axis", "size",
      ]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.targetPath).toBe("/project");
      expect(result.value.outputFormat).toBe("json");
      expect(result.value.axes).toEqual(["size"]);
    });
  });

  describe("--mcp flag", () => {
    it("returns an mcp result when --mcp is passed", () => {
      const result = parseArgs(["--mcp"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("mcp");
    });

    it("returns mcp even with other arguments", () => {
      const result = parseArgs(["--mcp", "/project"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("mcp");
    });
  });

  describe("--list-axes flag", () => {
    it("returns a list-axes result when --list-axes is passed", () => {
      const result = parseArgs(["--list-axes"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("list-axes");
    });

    it("returns list-axes even with other arguments", () => {
      const result = parseArgs(["--list-axes", "/project"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("list-axes");
    });

    it("includes axis information in the message", () => {
      const result = parseArgs(["--list-axes"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain("complexity");
      expect(result.error.message).toContain("size");
      expect(result.error.message).toContain("duplication");
    });
  });

  describe("--no-color flag", () => {
    it("defaults noColor to false when not specified", () => {
      const result = parseArgs(["/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.noColor).toBe(false);
    });

    it("sets noColor to true when --no-color is passed", () => {
      const result = parseArgs(["--no-color", "/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.noColor).toBe(true);
    });

    it("sets noColor to true regardless of flag position", () => {
      const result = parseArgs(["/project", "--no-color"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.noColor).toBe(true);
    });

    it("combines with other flags", () => {
      const result = parseArgs(["--format", "json", "--no-color", "/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.noColor).toBe(true);
      expect(result.value.outputFormat).toBe("json");
    });
  });

  describe("short flag aliases", () => {
    it("-f is an alias for --format", () => {
      const result = parseArgs(["-f", "json", "/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.outputFormat).toBe("json");
    });

    it("-a is an alias for --axis", () => {
      const result = parseArgs(["-a", "complexity", "/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.axes).toEqual(["complexity"]);
    });

    it("-a supports multiple axes like --axis", () => {
      const result = parseArgs(["-a", "complexity", "-a", "size", "/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.axes).toEqual(["complexity", "size"]);
    });

    it("-a deduplicates repeated axes like --axis", () => {
      const result = parseArgs(["-a", "complexity", "-a", "complexity", "/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.axes).toEqual(["complexity"]);
    });

    it("-o is an alias for --output", () => {
      const result = parseArgs(["-o", "/tmp/report.json", "/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.outputPath).toBe("/tmp/report.json");
      expect(result.value.outputFormat).toBe("json");
    });

    it("-h is an alias for --help", () => {
      const result = parseArgs(["-h"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("help");
    });

    it("-V is an alias for --version", () => {
      const result = parseArgs(["-V"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("version");
    });

    it("short flags can be mixed with long flags", () => {
      const result = parseArgs(["-f", "json", "--axis", "size", "/project"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.outputFormat).toBe("json");
      expect(result.value.axes).toEqual(["size"]);
    });

    it("-f returns an error when no value follows", () => {
      const result = parseArgs(["/project", "-f"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("error");
      expect(result.error.message).toContain("-f requires a value");
    });

    it("-a returns an error when no value follows", () => {
      const result = parseArgs(["/project", "-a"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("error");
      expect(result.error.message).toContain("-a requires a value");
    });

    it("-o returns an error when no value follows", () => {
      const result = parseArgs(["/project", "-o"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("error");
      expect(result.error.message).toContain("-o requires a value");
    });

    it("-f returns an error for unknown format", () => {
      const result = parseArgs(["-f", "xml", "/project"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain("xml");
    });

    it("-a returns an error for unknown axis", () => {
      const result = parseArgs(["-a", "magic", "/project"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain("magic");
    });

    it("short help text mentions short aliases", () => {
      const result = parseArgs(["-h"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain("-f");
      expect(result.error.message).toContain("-a");
      expect(result.error.message).toContain("-o");
      expect(result.error.message).toContain("-h");
      expect(result.error.message).toContain("-V");
    });
  });

  describe("unknown flags", () => {
    it("returns an error for unrecognized flags", () => {
      const result = parseArgs(["--unknown", "/project"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain("--unknown");
    });

    it("returns an error for unrecognized short flags", () => {
      const result = parseArgs(["-x", "/project"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain("-x");
    });
  });
});
